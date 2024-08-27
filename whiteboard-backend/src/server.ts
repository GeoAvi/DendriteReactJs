import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Keycloak from 'keycloak-connect';
import session from 'express-session';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());

// Set up session
const memoryStore = new session.MemoryStore();
app.use(
  session({
    secret: 'some secret',
    resave: false,
    saveUninitialized: true,
    store: memoryStore,
  })
);

// Initialize Keycloak
const keycloak = new Keycloak({
  store: memoryStore,
});

app.use(keycloak.middleware());

// Protected route example
app.get('/api/protected', keycloak.protect(), (req, res) => {
  res.json({ message: 'This is a protected resource' });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    // Verify the token with Keycloak
    keycloak.grantManager
      .validateToken(token, 'Bearer')
      .then((grant) => {
        if (grant) {
          (socket as any).user = grant.access_token.content;
          next();
        } else {
          next(new Error('Invalid token'));
        }
      })
      .catch((error) => {
        next(new Error('Authentication error'));
      });
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', (socket as any).user.preferred_username);

  socket.on('draw', (pathData: string) => {
    socket.broadcast.emit('draw', pathData);
  });

  socket.on('cursorMove', (data: { x: number; y: number }) => {
    socket.broadcast.emit('cursorMove', {
      userId: (socket as any).user.sub,
      ...data,
    });
  });

  socket.on('chatMessage', (message: string) => {
    io.emit('chatMessage', {
      userId: (socket as any).user.sub,
      username: (socket as any).user.preferred_username,
      message,
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', (socket as any).user.preferred_username);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
