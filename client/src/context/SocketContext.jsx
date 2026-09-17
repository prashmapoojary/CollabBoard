import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { setSocketId } from '../api/axios';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { accessToken, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setLocalSocketId] = useState(null);
  const [reconnectCounter, setReconnectCounter] = useState(0);

  const socketRef = useRef(null);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    // Connect only if authenticated and access token exists
    if (!isAuthenticated || !accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setIsConnected(false);
      setLocalSocketId(null);
      setSocketId(null);
      hasConnectedOnceRef.current = false;
      return;
    }

    // Connect to server (proxied by Vite to localhost:5000 in dev)
    const newSocket = io({
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      setLocalSocketId(newSocket.id);
      setSocketId(newSocket.id);

      if (hasConnectedOnceRef.current) {
        // This is a reconnection event
        setReconnectCounter((prev) => prev + 1);
      } else {
        hasConnectedOnceRef.current = true;
      }
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      setLocalSocketId(null);
      setSocketId(null);
      if (reason === 'io server disconnect') {
        // The server forcibly disconnected the socket (e.g. token expired)
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err?.message || err);
      setIsConnected(false);
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      setLocalSocketId(null);
      setSocketId(null);
      hasConnectedOnceRef.current = false;
    };
  }, [isAuthenticated, accessToken]);

  const value = {
    socket,
    isConnected,
    socketId,
    reconnectCounter,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
