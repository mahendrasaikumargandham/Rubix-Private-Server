const express = require("express");
const app = express();
const server = require("http").createServer(app)
const io = require("socket.io")(server);
const cors = require("cors");


app.use(cors({ origin: true }));

let users = [];
const addUser = (userName, userEmail, roomId, latitude, longitude, timeStamp, exactTime) => {
    users.push({
        userName: userName,
        userEmail: userEmail,
        roomId: roomId,
        latitude: latitude,
        longitude: longitude,
        timeStamp: timeStamp,
        exactTime: exactTime,
    })
}

const userLeave = (userName) => {
    users = users.filter(user => user.userName != userName)
}
const getRoomUsers = (roomId) => {
    return users.filter(user => (user.roomId == roomId));
}

const port = 3000;
app.get("/", (req, res) => {
    res.send("Rubix Private Server");
})
app.get('/cors', (req, res) => {
    res.send('This has CORS enabled');
    res.send("fgsuf");
})

io.on("connection", socket => {
    console.log("Someone Connected")
    socket.on("join-room", ({ userName, userEmail, roomId, latitude, longitude, timeStamp, ipAddress, exactTime }) => {
        console.log("User joined room");
        console.log(`User Name :`${userName})
        console.log(`Message :`${message})
        console.log(`User Email :`${userEmail})
        console.log(`Latitude :`${latitude})
        console.log(`Longitude :`${longitude})
        console.log(`IP Address :`${ipAddress})
        console.log(`Time Stamp :`${timeStamp})
        console.log(`Exact Time: `${exactTime})
        if(roomId && userName) {
            socket.join(roomId) 
            addUser(userName, userEmail, roomId, latitude, longitude, timeStamp, exactTime);
            socket.to(roomId).emit("user-connected", userName);
            io.to(roomId).emit("all-users", getRoomUsers(roomId));
            console.log(users);
        }

        socket.on("messages",({ userName, userEmail, message, latitude, longitude, timeStamp, ipAddress, exactTime }) => {
            console.log(`User Name :`${userName})
            console.log(`Message :`${message})
            console.log(`User Email :`${userEmail})
            console.log(`Latitude :`${latitude})
            console.log(`Longitude :`${longitude})
            console.log(`IP Address :`${ipAddress})
            console.log(`Time Stamp :`${timeStamp})
            console.log(`Exact Time: `${exactTime})
            io.emit("messages", ({ userName, userEmail, message, latitude, longitude, timeStamp, ipAddress, exactTime }));
        })

        socket.on("disconnect", () => {
            console.log("Disconnected");
            socket.leave(roomId);
            userLeave(userName);
            io.to(roomId).emit("all-users", getRoomUsers(roomId));
        })
    })
})

server.listen(port, ()=> {
    console.log(`Rubix API Running on  3000`);
})
