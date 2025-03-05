import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
  const [status, setStatus] = useState('disconnected');
  const [remoteAudioStream, setRemoteAudioStream] = useState(null);
  const socketRef = useRef();
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    // Connect to signaling server
    socketRef.current = io('http://localhost:3001');

    socketRef.current.on('connect', () => {
      console.log('Connected to signaling server');
    });

    socketRef.current.on('callAccepted', async (data) => {
      console.log('Call accepted, setting remote description');
      try {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        setStatus('connected');
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    });

    socketRef.current.on('iceCandidate', async (data) => {
      try {
        if (data.candidate) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      } catch (err) {
        console.error('Error adding ice candidate:', err);
      }
    });

    // Cleanup on unmount
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (remoteAudioStream && remoteAudioRef.current) {
      console.log('Setting up audio playback');
      remoteAudioRef.current.srcObject = remoteAudioStream;
      
      // Configure audio element for better quality
      remoteAudioRef.current.setSinkId('default')  // Use default audio output
        .then(() => {
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.playbackRate = 1.0;
          
          const playAudio = async () => {
            try {
              await remoteAudioRef.current.play();
              console.log('Audio playing successfully');
            } catch (err) {
              console.error('Error playing audio:', err);
            }
          };

          remoteAudioRef.current.onloadedmetadata = () => {
            console.log('Audio metadata loaded');
            playAudio();
          };
        })
        .catch(err => console.error('Error setting audio output:', err));
    }
  }, [remoteAudioStream]);

  const startCall = async () => {
    try {
      // Get local microphone stream with basic settings
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      
      // Create RTCPeerConnection with basic config
      const configuration = { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };
      
      peerConnectionRef.current = new RTCPeerConnection(configuration);
      
      // Add local stream
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });
      
      // Handle incoming streams
      peerConnectionRef.current.ontrack = (event) => {
        console.log('Received remote track');
        if (event.streams && event.streams[0]) {
          console.log('Setting remote stream');
          setRemoteAudioStream(event.streams[0]);
        }
      };
      
      // ICE candidate handling
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('iceCandidate', {
            candidate: event.candidate
          });
        }
      };
      
      // Create and send offer
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      
      socketRef.current.emit('callUser', {
        offer: peerConnectionRef.current.localDescription
      });
      
      setStatus('calling');
    } catch (err) {
      console.error('Error starting call:', err);
    }
  };

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setStatus('disconnected');
    setRemoteAudioStream(null);
  };

  return (
    <div className="App">
      <h1>WebRTC Audio Call Demo</h1>
      <div className="status">
        Status: <span className={status}>{status}</span>
      </div>
      
      <div className="controls">
        {status === 'disconnected' && (
          <button onClick={startCall}>Start Call</button>
        )}
        {(status === 'calling' || status === 'connected') && (
          <button onClick={endCall}>End Call</button>
        )}
      </div>
      
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        controls // Add controls for debugging
      />
    </div>
  );
}

export default App;