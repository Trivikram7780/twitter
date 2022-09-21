const express = require("express");

const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//Authenticate Token

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "my_secrete_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(400);
    response.send("Invalid JWT Token");
  }
};

// registration of user

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getQuery = `
    select *
    from
    user 
    where 
    username = '${username}';
    `;
  const isUserFound = await db.get(getQuery);
  if (isUserFound !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log(hashedPassword);
      const postQuery = `
         insert into 
         user ( name , username , password , gender)
         values(
          '${name}',
          '${username}',
          '${hashedPassword}',
          '${gender}'
         );
          `;
      const dbResponse = await db.run(postQuery);
      const id = dbResponse.lastID;
      console.log(id);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  }
});

// logging the user

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getQuery = `
    select *
    from
    user 
    where 
    username = '${username}';
    `;
  const isUserFound = await db.get(getQuery);
  if (isUserFound === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordTrue = await bcrypt.compare(password, isUserFound.password);
    if (isPasswordTrue) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "my_secrete_token");
      console.log(jwtToken);
      response.send({
        jwtToken: jwtToken,
      });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getQuery = `
    select 
    follower.following_user_id
    from
    (user join 
    follower on user.user_id = follower.follower_user_id) 
    where
    username = '${username}';
    `;
  const getList = await db.all(getQuery);
  const newArr = [];
  for (let i of getList) {
    const getQuery = `
    select 
    username,
    tweet,
    date_time
    from 
    user natural join tweet 
    where 
    user.user_id = ${i.following_user_id}
    ;
    `;
    const getLists = await db.all(getQuery);
    for (let obj of getLists) {
      const res = {
        username: obj.username,
        tweet: obj.tweet,
        dateTime: obj.date_time,
      };
      newArr.push(res);
    }
  }
  response.send(newArr);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getQuery = `
    select 
    follower.following_user_id
    from
    (user join 
    follower on user.user_id = follower.follower_user_id) 
    where
    username = '${username}';
    `;
  const getList = await db.all(getQuery);
  const newArray = [];
  for (let i of getList) {
    const getUserQuery = `
      select
      name
     from 
     user
     where 
     user_id = ${i.following_user_id};
      `;
    const getItem = await db.get(getUserQuery);
    newArray.push(getItem);
  }
  response.send(newArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getQuery = `
    select 
    follower.follower_user_id
    from
    user join 
    follower on user.user_id = follower.following_user_id
    where
    username = '${username}';
    `;
  const getList = await db.all(getQuery);
  const newArray = [];
  for (let i of getList) {
    const getUserQuery = `
      select
      name
     from 
     user
     where 
     user_id = ${i.follower_user_id};
      `;
    const getItem = await db.get(getUserQuery);
    newArray.push(getItem);
  }
  response.send(newArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserId = `
     select 
    follower.following_user_id
    from
    (user join 
    follower on user.user_id = follower.follower_user_id) 
    where
    username = '${username}';
    `;
  const getFollowersId = await db.all(getUserId);
  const followersArray = getFollowersId.map((obj) => obj.following_user_id);
  const tweetUser = `
  select
  user_id
  from
  tweet 
  where tweet_id = ${tweetId};
  `;
  const tweetUserId = await db.get(tweetUser);
  if (followersArray.includes(tweetUserId.user_id)) {
    const tweetAndTime = `
      select
      tweet,
      date_time
      from
      tweet
      where
      tweet_id = ${tweetId};
      `;
    const getTweetAndTime = await db.get(tweetAndTime);

    const likesQuery = `
      select
      count(like_id) as likes
      from
      like
      where 
      tweet_id = ${tweetId};
      `;

    const likesCount = await db.get(likesQuery);

    const replyQuery = `
      select
      count(reply_id) as replies
      from
      reply
      where 
      tweet_id = ${tweetId};
      `;

    const repliesCount = await db.get(replyQuery);

    const sendResponse = {
      tweet: getTweetAndTime.tweet,
      likes: likesCount.likes,
      replies: repliesCount.replies,
      dateTime: getTweetAndTime.date_time,
    };
    response.send(sendResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `
     select 
    follower.following_user_id
    from
    (user join 
    follower on user.user_id = follower.follower_user_id) 
    where
    username = '${username}';
    `;
    const getFollowersId = await db.all(getUserId);
    const followersArray = getFollowersId.map((obj) => obj.following_user_id);
    const tweetUser = `
  select
  user_id
  from
  tweet 
  where tweet_id = ${tweetId};
  `;
    const tweetUserId = await db.get(tweetUser);
    if (followersArray.includes(tweetUserId.user_id)) {
      const likeQuery = `
      select 
      user.name 
      from
      user join like on 
      user.user_id = like.user_id
      where 
      tweet_id = ${tweetId};
      `;
      const likedBy = await db.all(likeQuery);
      const likedNames = likedBy.map((obj) => obj.name);
      const sendResponse = {
        likes: likedNames,
      };
      response.send(sendResponse);
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `
     select 
    follower.following_user_id
    from
    (user join 
    follower on user.user_id = follower.follower_user_id) 
    where
    username = '${username}';
    `;
    const getFollowersId = await db.all(getUserId);
    const followersArray = getFollowersId.map((obj) => obj.following_user_id);
    const tweetUser = `
  select
  user_id
  from
  tweet 
  where tweet_id = ${tweetId};
  `;
    const tweetUserId = await db.get(tweetUser);
    if (followersArray.includes(tweetUserId.user_id)) {
      const replyQuery = `
    select 
     user.name,
     reply.reply
     from
     user join reply on
     user.user_id = reply.user_id
     where 
     tweet_id = ${tweetId};
    `;
      const repliesResponse = await db.all(replyQuery);
      const sendResponse = {
        replies: repliesResponse,
      };
      response.send(sendResponse);
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `
    select 
    user_id
    from
    user 
    where
    username = '${username}';
    `;
  const user = await db.get(getUserId);
  const userId = user.user_id;
  const getUserIds = `
     select
     tweet_id
     from
     tweet
     where
     user_id = ${userId};
    `;
  const ids = await db.all(getUserIds);
  const idsArr = ids.map((obj) => obj.tweet_id);
  let responseArr = [];

  for (let tweetId of idsArr) {
    const tweetAndTime = `
      select
      tweet,
      date_time
      from
      tweet
      where
      tweet_id = ${tweetId};
      `;
    const getTweetAndTime = await db.get(tweetAndTime);

    const likesQuery = `
      select
      count(like_id) as likes
      from
      like
      where 
      tweet_id = ${tweetId};
      `;

    const likesCount = await db.get(likesQuery);

    const replyQuery = `
      select
      count(reply_id) as replies
      from
      reply
      where 
      tweet_id = ${tweetId};
      `;

    const repliesCount = await db.get(replyQuery);

    const sendResponse = {
      tweet: getTweetAndTime.tweet,
      likes: likesCount.likes,
      replies: repliesCount.replies,
      dateTime: getTweetAndTime.date_time,
    };
    responseArr.push(sendResponse);
  }
  response.send(responseArr);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserId = `
    select user_id
    from
    user
    where
    username = '${username}';
    `;
  const idObj = await db.get(getUserId);
  const userId = idObj.user_id;
  const date = new Date();
  const presentDate = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const postQuery = `
    insert into
    tweet (tweet , user_id , date_time)
    values(
        '${tweet}',
         ${userId},
        '${presentDate}'
    );
    `;
  await db.run(postQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `
    select user_id 
    from user
    where 
    username = '${username}';
    `;
    const userObj = await db.get(getUserId);
    const userId = userObj.user_id;
    console.log(userId);
    const tweetQuery = `
    select 
    user_id
    from
    tweet
    where
    tweet_id = ${tweetId};
    `;
    const tweetObj = await db.get(tweetQuery);
    const tweetUserId = tweetObj.user_id;
    console.log(tweetUserId);
    if (userId === tweetUserId) {
      const deleteQuery = `
      delete from tweet
      where
      tweet_id = ${tweetId};
      `;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
