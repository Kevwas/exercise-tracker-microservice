const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

/** Set up mongoose */
let mongoose;
try {
  mongoose = require("mongoose");
} catch (err) {
  console.log(err);
}
mongoose.connect(process.env.MONGO_URI);

/** Create Models */
const exerciseSchema = new mongoose.Schema({
  description: String,
  duration: Number,
  date: Date,
  username: String,
  __v: { type: Number, select: false },
});

const Exercise = mongoose.model("exercise", exerciseSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, select: true },
  count: { type: Number, default: 0, select: false },
  __v: { type: Number, select: false },
});

const User = mongoose.model("user", userSchema);

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/api/users", async (_req, res) => {
  const users = await User.find();
  res.json(users);
});

app.get("/api/users/:_id/logs", async (req, res) => {
  const userId = req.params._id;

  const findUser = await User.findOne({ _id: userId }).select({ count: 1 });
  if (!findUser) {
    return res.status(404).json({ message: "User not found." });
  }

  let { from, to, limit } = req.query;
  from = new Date(from);
  to = new Date(to);
  limit = parseInt(limit);

  const query = { username: findUser.username };

  if (!(from.toDateString() === "Invalid Date")) {
    query["date"] = { ...query.date, $gt: from };
  }

  if (!(to.toDateString() === "Invalid Date")) {
    query["date"] = { ...query.date, $lt: to };
  }

  if (isNaN(limit)) {
    limit = null;
  }

  const log = await Exercise.find(query)
    .select({
      _id: 0,
      username: 0,
    })
    .limit(limit);

  res.json({
    ...findUser._doc,
    log: log.map((l) => {
      return {
        ...l._doc,
        date: l._doc.date.toDateString(),
      };
    }),
  });
});

app.post("/api/users", async (req, res) => {
  const { username } = req.body;
  let userEntry = await User.findOne({
    username: username,
  });

  if (userEntry) {
    return res.status(401).json({ message: "Username taken." });
  }

  userEntry = new User({
    username,
  });

  await userEntry.save();

  res.json({
    _id: userEntry._id,
    username: userEntry.username,
  });
});

app.post("/api/users/:_id/exercises", async (req, res) => {
  const { description, duration, date } = req.body;
  const userId = req.params._id;

  const findUser = await User.findOne({ _id: userId }).select({ count: 1 });
  if (!findUser) {
    return res.status(404).json({ message: "User not found." });
  }

  const newDate = date
    ? new Date(date.replace(/-/g, "/")).toDateString()
    : new Date().toDateString();

  const newExercise = new Exercise({
    description,
    duration: parseFloat(duration),
    date: newDate,
    username: findUser.username,
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await newExercise.save({ session });
    findUser.count = findUser.count + 1;
    await findUser.save({ session });

    // Commit the changes
    await session.commitTransaction();
  } catch (err) {
    // Rollback any changes made in the database
    await session.abortTransaction();
    // Rethrow the error
    throw Error(err.message);
  } finally {
    // Ending the session
    session.endSession();
  }

  const returnObj = {
    _id: findUser._id,
    username: newExercise.username,
    date: newExercise.date.toDateString(),
    duration: newExercise.duration,
    description: newExercise.description,
  };

  res.json(returnObj);
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
