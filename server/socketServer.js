const socketio = require('socket.io');

const Database = require('./database');
const WebServer = require('./webServer');

class SocketServer {
  static init() {
    const io = socketio(WebServer.httpServer);
    this.io = io;
    console.log('Socket server listening');

    const selectedVideos = {};

    // Send events to the client when anything on the database changes.
    Database.on('videoAdded', v => io.in(v.channelName).emit('videoAdded', v.video));
    Database.on('videoRemoved', v => io.in(v.channelName).emit('videoRemoved', v.video));
    Database.on('videoUpdated', v => io.in(v.channelName).emit('videoUpdated', v.video));

    io.on('connection', (socket) => {
      console.log('UI socket connected');

      // Join a channel, tell the client the current video.
      socket.on('joinChannel', (channelName) => {
        socket.join(channelName);
        socket.emit('videoSelected', selectedVideos[channelName]);
      });

      // When a video is selected, tell other people on this channel about it.
      socket.on('selectVideo', (data) => {
        selectedVideos[data.channelName] = data.videoId;
        io.sockets.in(data.channelName).emit('videoSelected', data.videoId);
      });

      socket.on('changeChannel', (from, to) => {
        io.sockets.in(from).emit('changeChannel', to);
      });
    });
  }

  static emit(msg, data) {
    if (this.io) {
      this.io.emit(msg, data);
    }
  }
}

module.exports = SocketServer;
