import jsonwebtoken from "jsonwebtoken";
import cookieParser from "cookie-parser";
import express from "express";
import mongodb from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

// * INITIALIZE APP

const app = express();
const port = process.env.PORT || 4000;

// * MIDDLEWARE

app.use(
	cors({
		origin: ["http://localhost:5173"],
		credentials: true,
		optionsSuccessStatus: 200,
	})
);
app.use(express.json());
app.use(cookieParser());

// * TOKEN MIDDLEWARE

const verifyToken = function (req, res, next) {
	const token = req.cookies?.token;
	if (!token) return res.status(401).send({ message: "No permission" });
	if (token) {
		jsonwebtoken.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
			if (error) return res.status(401).send({ message: "Unauthorized" });
			req.user = decoded;
			next();
		});
	}
};

// * MONGODB CONFIGURATION

const { MongoClient, ServerApiVersion, ObjectId } = mongodb;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kmw7lj5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

//  CREATE A MONGOCLIENT WITH A MONGOCLIENTOPTIONS OBJECT TO SET THE STABLE API VERSION
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

async function run() {
	try {
		//  Connect the client to the server	(optional starting in v4.7)
		// await client.connect();

		// * COLLECTIONS

		const jobsCollection = client.db("MarketDB").collection("MarketJobs");
		const bidsCollection = client.db("MarketDB").collection("Marketbids");

		// * CLEAR TOKEN

		app.get("/logout", async (req, res) => {
			res
				.clearCookie("token", {
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
					maxAge: 0,
				})
				.send({ message: false });
		});

		// * ADD TOKEN

		app.post("/jwt", async (req, res) => {
			const user = req.body;
			const token = jsonwebtoken.sign(user, process.env.ACCESS_TOKEN, {
				expiresIn: "1h",
			});
			res
				.cookie("token", token, {
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
				})
				.send({ success: true });
		});

		// * READ DATA

		app.get("/market-jobs", verifyToken, async (req, res) => {
			let query = {};
			if (req.query?.email) query = { buyer_email: req.query.email };
			if (req.query?.filter) query = { category: req.query.filter };
			if (req.query?.search)
				query = { job_title: { $regex: req.query.search, $options: "i" } };
			const result = await jobsCollection.find(query).toArray();
			res.send(result);
		});

		app.get("/market-jobs/:id", verifyToken, async (req, res) => {
			const query = { _id: new ObjectId(req.params.id) };
			const result = await jobsCollection.findOne(query);
			res.send(result);
		});

		app.get("/market-bids", verifyToken, async (req, res) => {
			let query = {};
			if (req.query?.email) query = { email: req.query.email };
			if (req.query?.buyer_email)
				query = { buyer_email: req.query.buyer_email };
			const result = await bidsCollection.find(query).toArray();
			res.send(result);
		});

		app.get("/all-jobs", async (req, res) => {
			let options = {};
			const search = req.query.search;
			const sort = req.query.sort;
			const page = +req.query.page;
			const number = +req.query.number;
			let query = { job_title: { $regex: search, $options: "i" } };
			if (req.query.filter) query.category = req.query.filter;
			if (sort) options = { sort: { deadline: sort === "Asc" ? 1 : -1 } };
			const result = await jobsCollection
				.find(query, options)
				.skip(number * page)
				.limit(number)
				.toArray();
			res.send(result);
		});

		// * CREATE DATA

		app.post("/market-bids", verifyToken, async (req, res) => {
			const bid = req.body;
			const applied = await bidsCollection.findOne({
				email: bid.email,
				job_id: bid.job_id,
			});
			if (applied) return res.status(400).send("You already applied");
			const result = await bidsCollection.insertOne(bid);
			res.send(result);
		});

		app.post("/market-jobs", verifyToken, async (req, res) => {
			const result = await jobsCollection.insertOne(req.body);
			res.send(result);
		});

		// * DELETE DATA

		app.delete("/market-jobs/:id", verifyToken, async (req, res) => {
			const query = { _id: new ObjectId(req.params.id) };
			const result = await jobsCollection.deleteOne(query);
			res.send(result);
		});

		// * UPDATE DATA

		app.put("/market-jobs/:id", verifyToken, async (req, res) => {
			const filter = { _id: new ObjectId(req.params.id) };
			const { _id, ...remaining } = req.body;
			const updated = {
				$set: {
					...remaining,
				},
			};
			const options = { upsert: true };
			const result = await jobsCollection.updateOne(filter, updated, options);
			res.send(result);
		});

		app.patch("/market-bids/:id", verifyToken, async (req, res) => {
			const filter = { _id: new ObjectId(req.params.id) };
			const options = { upsert: true };
			const updated = { $set: req.body };
			const result = await bidsCollection.updateOne(filter, updated, options);
			res.send(result);
		});

		// Send a ping to confirm a successful connection
		// await client.db("admin").command({ ping: 1 });
		console.log(
			"Pinged your deployment. You successfully connected to MongoDB!"
		);
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("server is running");
});

app.listen(port, () => {
	console.log("Server is running on port:", port);
});
