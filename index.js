const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
  },
});

const connectedUserIds = {};
let triviaSessionId = ["", new Date()];

let game = {
  users: {},
  game_state: "waiting",
  question: null,
  answers: [],
  correct_answer: null,
  buzzed_in: [],
  answered: [],
  show_answer: false,
  show_question: false,
  question_time: null,
  connectedUserIds: connectedUserIds,
};

const InitGame = {
  users: {},
  game_state: "waiting",
  question: null,
  answers: [],
  correct_answer: null,
  buzzed_in: [],
  answered: [],
  show_answer: false,
  show_question: false,
  question_time: null,
  connectedUserIds: connectedUserIds,
};

function resetTriviaSessionId() {
  axios
    .get("https://opentdb.com/api_token.php?command=request")
    .then((response) => {
      triviaSessionId[0] = response.data.token;
      triviaSessionId[1] = new Date();
    })
    .catch((error) =>
      console.error("Error resetting trivia session ID:", error)
    );
}

function getTriviaSessionId() {
  const current_time = new Date();
  const minsDelta = (current_time - triviaSessionId[1]) / 1000;
  if (minsDelta > 15000 || triviaSessionId[0] === "") {
    resetTriviaSessionId();
  }
  return triviaSessionId[0];
}

async function getQuestion() {
  const categories = ["9", "9", "9", "17", "18", "19", "20", "22", "23", "24"];
  const category = categories[Math.floor(Math.random() * categories.length)];
  try {
    const token = getTriviaSessionId();
    const response = await axios.get(
      `https://opentdb.com/api.php?amount=1&category=${category}&type=multiple&token=${token}`
    );
    if (response.data.response_code !== 0) {
      console.error("Error fetching trivia question:", response.data);
      return;
    }
    const question = response.data.results[0];
    game.question = question.question;
    game.answers = question.incorrect_answers.concat(question.correct_answer);
    game.correct_answer = question.correct_answer;
    game.buzzed_in = [];
    game.answered = [];
    game.show_answer = false;
    game.show_question = false;
    game.question_time = new Date().toLocaleTimeString();
    game.game_state = "question";
    game.connectedUserIds = connectedUserIds;
    io.emit("app update", game);
  } catch (error) {
    console.error("Error fetching trivia question:", error);
  }
}

app.use(cors());
app.get("/", (req, res) => {
  res.send("Welcome to your Express-SocketIO server!");
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("addName", (name) => {
    try {
      connectedUserIds[socket.id] = name;
      game.connectedUserIds = connectedUserIds;
      if (!game.users[name]) {
        game.users[name] = {
          score: 0,
          role: "player",
        };
      }
      io.emit("app update", game);
    } catch (error) {
      console.error("Error adding name:", error);
    }
  });

  socket.on("nextQuestion", async () => {
    try {
      await getQuestion();
    } catch (error) {
      console.error("Error getting next question:", error);
    }
  });

  socket.on("buzz", () => {
    try {
      const name = connectedUserIds[socket.id];
      if (!game.buzzed_in.some((buzz) => buzz[0] === name)) {
        game.buzzed_in.push([name, new Date().toLocaleTimeString()]);
        io.emit("app update", game);
      }
    } catch (error) {
      console.error("Error buzzing in:", error);
    }
  });

  socket.on("answer", (answer) => {
    try {
      const name = connectedUserIds[socket.id];
      game.answered.push([name, answer, new Date().toLocaleTimeString()]);
      io.emit("app update", game);
    } catch (error) {
      console.error("Error answering question:", error);
    }
  });

  socket.on("showAnswer", () => {
    try {
      game.show_answer = true;
      io.emit("app update", game);
    } catch (error) {
      console.error("Error showing answer:", error);
    }
  });

  socket.on("showQuestion", () => {
    try {
      game.show_question = true;
      io.emit("app update", game);
    } catch (error) {
      console.error("Error showing question:", error);
    }
  });

  socket.on("addScore", (name) => {
    try {
      if (game.users[name]) {
        game.users[name].score += 1;
        io.emit("app update", game);
      }
    } catch (error) {
      console.error("Error adding score:", error);
    }
  });

  socket.on("removeScore", (name) => {
    try {
      if (game.users[name]) {
        game.users[name].score -= 1;
        io.emit("app update", game);
      }
    } catch (error) {
      console.error("Error removing score:", error);
    }
  });

  socket.on("resetGame", () => {
    try {
      Object.keys(game.users).forEach((user) => {
        game.users[user].score = 0;
      });
      game = JSON.parse(JSON.stringify(InitGame)); // Reset the game to initial state
    } catch (error) {
      console.error("Error resetting game:", error);
    }
    io.emit("app update", game);
  });

  socket.on("changeRole", (name) => {
    try {
      let wasPresenter = game.users[name].role === "presenter";
      Object.values(game.users).forEach((user) => {
        user.role = "player";
      });
      if (game.users[name] && !wasPresenter) {
        game.users[name].role = "presenter";
      }
    } catch (error) {
      console.error("Error changing role:", error);
    }
    io.emit("app update", game);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    try {
      delete connectedUserIds[socket.id];
    } catch (error) {
      console.error("Error deleting user:", error);
    }
    io.emit("app update", game);
  });
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
