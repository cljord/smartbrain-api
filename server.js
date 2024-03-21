const express = require("express");
const bcrypt = require("bcrypt-nodejs");
const cors = require("cors");
const knex = require("knex");

const app = express();

const db = knex({
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false},
    host: process.env.DATABSE_HOST,
    port: 5432,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PW,
    database: process.env.DATABASE_DB
  }
});

const returnClarifaiRequestOptions = (imageUrl) => {
  // Your PAT (Personal Access Token) can be found in the portal under Authentification
  const PAT = process.env.CLARIFAI_PAT;
  // Specify the correct user_id/app_id pairings
  // Since you're making inferences outside your app's scope
  const USER_ID = 'kriskris';
  const APP_ID = 'Smartbrain';
  // Change these to whatever model and image URL you want to use
  const MODEL_ID = 'face-detection';
  const IMAGE_URL = imageUrl;

  const raw = JSON.stringify({
      "user_app_id": {
          "user_id": USER_ID,
          "app_id": APP_ID
      },
      "inputs": [
          {
              "data": {
                  "image": {
                      "url": IMAGE_URL
                      // "base64": IMAGE_BYTES_STRING
                  }
              }
          }
      ]
  });

  return {
      method: 'POST',
      headers: {
          'Accept': 'application/json',
          'Authorization': 'Key ' + PAT
      },
      body: raw
  };
}

app.use(express.json())
app.use(cors());

app.get("/", (req, res) => {
  res.json("success");
})

const handleApiCall = (req, res) => {
  fetch("https://api.clarifai.com/v2/models/" + "face-detection"+ "/outputs", returnClarifaiRequestOptions(req.body.input))
  .then(response => response.text())
  .then(result => res.json(result))
  .catch(err => res.status(400).json("bad clarifai call"));
}

app.post("/imageurl", (req, res) => {
  handleApiCall(req, res);
})

app.post("/signin", (req, res) => {
  const {email, name, password } = req.body;
  if (!email || !password) return res.status(400).json("incorrect form submission");

  db.select("email", "hash").from("login")
    .where("email", "=", email)
    .then(data => {
      const isValid = bcrypt.compareSync(password, data[0].hash)
      if (isValid) {
        return db.select("*").from("users")
          .where("email", "=", email)
          .then(user => {
            res.json(user[0]);
          })
          .catch(err => res.status(400).json("unable to get user"));
      } else {
        return res.status(400).json("wrong credentials");
      }
    }).catch(err => res.status(400).json("wrong credentials"));
})

app.post("/register", (req, res) => {
  const {email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json("incorrect form submission");

  const hash = bcrypt.hashSync(password);

  db.transaction(trx => {
    trx.insert({
      hash: hash,
      email: email
    })
    .into("login")
    .returning("email")
    .then(loginEmail => {
      return trx("users")
        .returning("*")
        .insert({
          email: loginEmail[0].email,
          name: name,
          joined: new Date()
        }).then(user => {
          res.json(user)
        })
    })
    .then(trx.commit)
    .catch(trx.rollback)
  })
  .catch(err => res.status(400).json("Unable to register"))
})

app.get("/profile/:id", (req, res) => {
  const {id} = req.params;
  let found = false;
  db.select("*").from("users").where({id: id}).then(user => {
    if (user.length) {
      res.json(user[0])
    } else {
      res.status(400).json("Not found");
    }
  })
  .catch(err => res.status(400).json("Not found"));
})

app.put("/image", (req, res) => {
  const {id} = req.body;
  db("users").where("id", "=", id)
  .increment("entries", 1)
  .returning("entries")
  .then(entries => {
    res.json(entries[0])
  })
  .catch(err => res.status(400).json("Unable to get count"))
})

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`app is running on port ${PORT}`)
});