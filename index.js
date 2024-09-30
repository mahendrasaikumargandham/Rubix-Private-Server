const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const morgan = require("morgan");
const redis = require("redis");
const { promisify } = require("util");
const geolib = require("geolib");
const crypto = require('crypto');
const NodeCache = require("node-cache");
const profanity = require('profanity-util');
const natural = require('natural');
const fs = require('fs');

// Enhanced security
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Logging
app.use(morgan('combined'));

// Redis setup for caching
const redisClient = redis.createClient(process.env.REDIS_URL);
const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);

// In-memory cache for frequently accessed data
const memCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });

let users = [];

// Sentiment analyzer
const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");

const addUser = async (userName, userEmail, roomId, latitude, longitude, timeStamp, exactTime) => {
  const user = {
    userName,
    userEmail,
    roomId,
    latitude,
    longitude,
    timeStamp,
    exactTime,
  };
  users.push(user);
  await setAsync(`user:${userName}`, JSON.stringify(user));
  memCache.set(`user:${userName}`, user);
}

const userLeave = async (userName) => {
  users = users.filter(user => user.userName != userName);
  await redisClient.del(`user:${userName}`);
  memCache.del(`user:${userName}`);
}

const getRoomUsers = async (roomId) => {
  const cachedUsers = memCache.get(`room:${roomId}`);
  if (cachedUsers) return cachedUsers;

  const redisUsers = await getAsync(`room:${roomId}`);
  if (redisUsers) {
    const parsedUsers = JSON.parse(redisUsers);
    memCache.set(`room:${roomId}`, parsedUsers);
    return parsedUsers;
  }

  const roomUsers = users.filter(user => user.roomId == roomId);
  await setAsync(`room:${roomId}`, JSON.stringify(roomUsers));
  memCache.set(`room:${roomId}`, roomUsers);
  return roomUsers;
}

const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Rubix Private Server");
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// New endpoint for user search
app.get('/search', async (req, res) => {
  const { query } = req.query;
  const matchedUsers = users.filter(user => 
    user.userName.toLowerCase().includes(query.toLowerCase()) ||
    user.userEmail.toLowerCase().includes(query.toLowerCase())
  );
  res.json(matchedUsers);
});

io.on("connection", socket => {
  console.log("Someone Connected");

  socket.on("join-room", async ({ userName, userEmail, roomId, latitude, longitude, timeStamp, ipAddress, exactTime }) => {
    console.log(`User ${userName} joined room ${roomId}`);
    
    if(roomId && userName) {
      socket.join(roomId);
      await addUser(userName, userEmail, roomId, latitude, longitude, timeStamp, exactTime);
      socket.to(roomId).emit("user-connected", userName);
      
      const roomUsers = await getRoomUsers(roomId);
      io.to(roomId).emit("all-users", roomUsers);
      
      // Notify nearby users
      const nearbyUsers = users.filter(user => 
        user.roomId !== roomId && 
        geolib.getDistance(
          { latitude: user.latitude, longitude: user.longitude },
          { latitude, longitude }
        ) <= 5000 // 5km radius
      );
      nearbyUsers.forEach(user => {
        io.to(user.roomId).emit("nearby-user", { userName, distance: geolib.getDistance(
          { latitude: user.latitude, longitude: user.longitude },
          { latitude, longitude }
        )});
      });
    }
  });

  socket.on("send-message", async ({ userName, userEmail, message, roomId, latitude, longitude, timeStamp, ipAddress, exactTime }) => {
    console.log(`Message from ${userName} in room ${roomId}: ${message}`);
    
    // Spam protection
    const userMessageCount = await getAsync(`messageCount:${userName}`);
    if (userMessageCount && parseInt(userMessageCount) > 10) {
      socket.emit("error", "You are sending too many messages. Please slow down.");
      return;
    }
    await setAsync(`messageCount:${userName}`, parseInt(userMessageCount || 0) + 1, 'EX', 60);

    // Profanity filter
    const cleanMessage = profanity.purify(message)[0];

    // Message encryption
    const encryptedMessage = crypto.publicEncrypt(
      process.env.PUBLIC_KEY,
      Buffer.from(cleanMessage)
    );

    io.to(roomId).emit("new-message", { 
      userName, 
      userEmail, 
      message: encryptedMessage.toString('base64'), 
      latitude, 
      longitude, 
      timeStamp, 
      ipAddress, 
      exactTime 
    });
    
    // Sentiment analysis
    const sentiment = analyzer.getSentiment(cleanMessage.split(' '));
    io.to(roomId).emit("room-mood", sentiment > 0 ? "positive" : sentiment < 0 ? "negative" : "neutral");

    // Log message for compliance
    fs.appendFile('message_log.txt', `${new Date().toISOString()} - ${userName}: ${cleanMessage}\n`, (err) => {
      if (err) console.error('Error logging message:', err);
    });
  });

  // New event for private messaging
  socket.on("private-message", async ({ from, to, message }) => {
    const recipient = users.find(user => user.userName === to);
    if (recipient) {
      io.to(recipient.socketId).emit("private-message", { from, message });
    } else {
      socket.emit("error", "User not found or offline");
    }
  });

  // New event for user typing indicator
  socket.on("typing", ({ userName, roomId, isTyping }) => {
    socket.to(roomId).emit("user-typing", { userName, isTyping });
  });

  socket.on("disconnect", async () => {
    console.log("User Disconnected");
    const user = users.find(user => user.socketId === socket.id);
    if (user) {
      const { userName, roomId } = user;
      socket.leave(roomId);
      await userLeave(userName);
      const roomUsers = await getRoomUsers(roomId);
      io.to(roomId).emit("all-users", roomUsers);
      io.to(roomId).emit("user-disconnected", userName);
    }
  });
});

server.listen(port, () => {
  console.log(`Rubix API Running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    redisClient.quit();
  });
});
