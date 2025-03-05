const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const wrtc = require('@roamhq/wrtc');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('WebRTC Node.js Server is running');
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let peerConnection = null;
  let audioSource = null;

  socket.on('callUser', async (data) => {
    try {
      peerConnection = new wrtc.RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      const { RTCAudioSource } = wrtc.nonstandard;
      audioSource = new RTCAudioSource();
      
      // Audio settings with faster playback
      const sampleRate = 48000;
      const samplesPerFrame = 480;
      const playbackSpeed = 1.5; // Increase playback speed
      
      // Read audio file
      const audioFile = fs.readFileSync(path.join(__dirname, 'assets', 'audio.wav'));
      const audioData = new Int16Array(audioFile.buffer);
      let currentIndex = 0;

      // Create and add track
      const track = audioSource.createTrack();
      const stream = new wrtc.MediaStream([track]);
      peerConnection.addTrack(track, stream);

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('iceCandidate', {
            candidate: event.candidate
          });
        }
      };

      // Create buffer
      const samples = new Int16Array(samplesPerFrame);
      
      // Start streaming audio with faster interval
      const audioInterval = setInterval(() => {
        // Fill samples buffer with increased step size
        for (let i = 0; i < samplesPerFrame; i++) {
          const sourceIndex = Math.floor((currentIndex + i * playbackSpeed) % audioData.length);
          samples[i] = audioData[sourceIndex];
        }
        
        audioSource.onData({
          samples: samples,
          sampleRate: sampleRate,
          channels: 1,
          bitsPerSample: 16
        });

        currentIndex = Math.floor((currentIndex + samplesPerFrame * playbackSpeed) % audioData.length);
      }, 8); // Decreased interval for faster playback

      socket.audioInterval = audioInterval;

      // Set remote description and create answer
      await peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('callAccepted', {
        answer: peerConnection.localDescription
      });

    } catch (err) {
      console.error('Error in call setup:', err);
    }
  });

  socket.on('iceCandidate', (data) => {
    if (peerConnection && data.candidate) {
      peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate))
        .catch(err => console.error('Error adding ICE candidate:', err));
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.audioInterval) {
      clearInterval(socket.audioInterval);
    }
    if (peerConnection) {
      peerConnection.close();
    }
    if (audioSource) {
      audioSource = null;
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});