const express = require("express");
const app = express();
const cors = require("cors");
const server = require("http").createServer(app)
const io = require("socket.io")(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

let users = [];
let host;

const addUser = (userName, userEmail, roomId, currentLocation, reachedTime) => {
    users.push({
        userName: userName,
        userEmail: userEmail,
        roomId: roomId,
        currentLocation: currentLocation,
        reachedTime: reachedTime
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

io.on("connection", socket => {
    console.log("Someone Connected")
    socket.on("join-room", ({ userName, userEmail, roomId, currentLocation, reachedTime }) => {
        console.log("User joined room");
        console.log(userName)
        console.log(roomId)
        console.log(userEmail)
        console.log(currentLocation)
        if(roomId && userName) {
            socket.join(roomId) 
            addUser(userName, userEmail, roomId, currentLocation, reachedTime)
            socket.to(roomId).emit("user-connected", userName);
            io.to(roomId).emit("all-users", getRoomUsers(roomId));
            console.log(users);
        }

        socket.on("messages",({ userName, userEmail, message, currentLocation, reachedTime, messageType }) => {
            console.log(userName)
            console.log(message)
            console.log(userEmail)
            console.log(currentLocation)
            console.log(reachedTime)
            console.log(messageType)
            io.emit("messages", ({ userName, userEmail, message, currentLocation, reachedTime, messageType }));
        })

        socket.on("callUser", ({ userToCall, signalData, from, name}) => {
            io.to(userToCall).emit("callUser", {
                signal: signalData,
                from, 
                name
            })
        })

        socket.on("updateMyMedia", ({ type, currentMediaStatus }) => {
            console.log("updateUserMedia")
            socket.broadcast.emit("updateUserMedia", { type, currentMediaStatus })
        })

        socket.on("answerCall", (data) => {
            socket.broadcast.emit("updateUserMedia", {
                type: data.type,
                currentMediaStatus: data.myMediaStatus,
            })
            io.to(data.to).emit("callAccepted", data);
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