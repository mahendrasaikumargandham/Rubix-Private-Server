const express = require("express");
const app = express();
const server = require("http").Server(app)
const io = require("socket.io")(server)


const users = [];

const addUser = (userName, roomId) => {
    users.push({
        userName: userName,
        roomId: roomId
    })
}

const userLeave = (userName) => {
    users = users.filter(user => user.userName != userName)
}
const getRoomUsers = (roomId) => {
    return users.filter(user => (user.roomId == roomId));
}

const port = 3001;
app.get("/", (req, res) => {
    res.send("Rubix Private Server");
})

io.on("connection", socket => {
    console.log("Someone Connected")
    socket.on("join-room", ({ userName, roomId }) => {
        console.log("User joined room");
        console.log(userName)
        console.log(roomId)
        socket.join(roomId) 
        addUser(userName, roomId)
        socket.to(roomId).emit("user-connected", userName);
        io.to(roomId).emit("all-users", getRoomUsers(roomId));

        socket.on("disconnect", () => {
            console.log("Disconnected");
            socket.leave(roomId);
            userLeave(userName);
            io.to(roomId).emit("all-users", getRoomUsers(roomId));
        })
    })
})

server.listen(port, ()=> {
    console.log(`Rubix API Running on  3001`);
})