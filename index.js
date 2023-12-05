const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');

require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)



app.use(cors());
app.use(express.json());


const port = process.env.PORT || 5000;

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  // console.log(authorization)

  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }

  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }

    req.decoded = decoded;
    next();
  })
}





const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ekuronr.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {


    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    const usersCollection = client.db("foodvillage").collection("users");
    const menuItemsCollection = client.db("foodvillage").collection("menu");
    const reviewsCollection = client.db("foodvillage").collection("reviews");
    const cartsCollection = client.db("foodvillage").collection("carts");
    const paymentCollection = client.db("foodvillage").collection("payment");
    

    //jwt
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })

    //admin verification
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'false information' });
      }

      next();
    }

    //user data storing api
    app.post('/user', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'the user is already exist in the database' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    // get all user api data
    app.get('/user', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    //checking user if user is admin or not
    app.get('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ message: 'not admin' })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    })

    //set a role for user
    app.patch('/user/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    //all menu Items data get
    app.get('/menuitems', async (req, res) => {
      const menuItem = await menuItemsCollection.find().toArray();
      res.send(menuItem);
    });

    //menu Item storing
    app.post('/menuitems', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuItemsCollection.insertOne(newItem);
      res.send(result);
    })

    //menu Item Delete 
    app.delete('/menuitems/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuItemsCollection.deleteOne(query);
      res.send(result);
    })

    //all reviews data get
    app.get('/reviews', async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews);
    })

    //carts data storing
    app.post('/carts', async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartsCollection.insertOne(item);
      res.send(result);
    });


    //carts data getting based on email
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      // console.log('email:', email)

      if (!email) {
        res.send([])
      }

      const decodedEmail = req.decoded.email;
      // console.log('decodedemail:', decodedEmail);

      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }


      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });


    //carts item delete
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    })

    //carts payment
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: [
          "card"
        ],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })


    //payment history save and cart data delete
    app.post('/payment', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItemId.map(id => new ObjectId(id)) } }
      const result = await cartsCollection.deleteMany(query);

      res.send({ insertResult, result })
    })



    //Get payemnt data
    app.get('/payment-history',verifyJWT, async(req,res)=>{
      const email = req.query.email;

      

      const query = {email : email};

      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })



    // user dashboard stats localhost:5000/user-dashboard-stats?email=email@gmail.com
    app.get('/user-dashboard-stats', verifyJWT, async(req,res)=>{
      const email = req.query.email;
      console.log('email:', email);

      const decoded = req.decoded.email;

      if(decoded != email){
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }

      const query = {email:email};
      const Booking = await cartsCollection.find(query).toArray();
      const order = await paymentCollection.find(query).toArray();
      
      
      res.send([Booking,order])
    })



    
    //collecting data for admin dashboaed
    app.get('/admin-dashboard-stats',verifyJWT,verifyAdmin, async (req, res) => {

      const customer = await usersCollection.estimatedDocumentCount();
      const products = await menuItemsCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount()

      const query = await paymentCollection.find().toArray();
      const revenues = query.reduce((sum, peyment) => sum + peyment.price, 0).toFixed(2)

      res.send({ customer, products, orders, revenues })
    })






    //collection of order states depend on category
    app.get('/order-states',verifyJWT,verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemId',
            foreignField: '_id',
            as: 'menuItems',
          },
        },
        {
          $unwind: '$menuItems',
        },
        {
          $group: {
            _id: '$menuItems.category', // Rename _id to category
            count: { $sum: 1 },
            total: { $sum: '$menuItems.price' }, // Rename totalPrice to total
          },
        },
        {
          $project: {
            _id: 0, // Exclude _id from the result
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] }, // Round total to two decimal places
          },
        },
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray();

      res.send(result)
    })






    //add reviews
    app.post('/reviews', async(req,res)=>{
      const data = req.body;
      const result = await reviewsCollection.insertOne(data);
      res.send(result)
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("FoodVillage Server Is Running")
});

app.listen(port, () => {
  console.log(`FoodVillage Server Is running on ${port}`);
})



            