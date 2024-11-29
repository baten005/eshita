const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const app = express();
var cors = require('cors');
app.use(cors());

const REDIS_URL = 'redis://red-ct4aum68ii6s73dcuth0:Md2Ps5F0S7muZYt3T35HzasPiDEWli95@oregon-redis.render.com:6379';

function createRedisClient() {
  const client = redis.createClient({
    url: REDIS_URL,
    socket: {
      tls: true,
      rejectUnauthorized: false,
    },
  });
  client.on('error', (err) => {
    console.error('Redis connection error:', err);
    setTimeout(() => {
      console.log('Attempting to reconnect to Redis...');
      client.connect().catch((e) => console.error('Reconnection failed:', e));
    }, 5000);
  });

  client.on('connect', () => {
    console.log('Connected to Redis');
  });

  return client;
}

const redisClient = createRedisClient();
redisClient.connect().catch((err) => {
  console.error('Initial Redis connection error:', err);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.use(express.static('public'));

redisClient.get('products').then((data) => {
  if (!data) {
    redisClient.set('products', JSON.stringify([]));
  }
}).catch((err) => console.error('Error initializing products in Redis:', err));

app.get('/', async (req, res) => {
  res.redirect('admin');
});
app.get('/admin', async (req, res) => {
  try {
    const data = await redisClient.get('products');
    const products = JSON.parse(data || '[]');
    res.render('admin', { products });
  } catch (err) {
    res.status(500).send('Error fetching products from Redis');
  }
});

app.post('/add-product', async (req, res) => {
  const { title, price, imageUrl, company, sizes, stock } = req.body;
  const newProduct = {
    id: Date.now().toString(),
    title,
    price: parseFloat(price),
    imageUrl,
    company,
    sizes: sizes.split(',').map((size) => parseInt(size)),
    stock: stock.split(',').map((s) => parseInt(s)),
  };

  try {
    const data = await redisClient.get('products');
    const products = JSON.parse(data || '[]');
    products.push(newProduct);
    await redisClient.set('products', JSON.stringify(products));
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Error saving product to Redis');
  }
});

app.get('/products', async (req, res) => {
  try {
    const data = await redisClient.get('products');
    res.json(JSON.parse(data || '[]'));
  } catch (err) {
    res.status(500).send('Error fetching products from Redis');
  }
});

app.post('/update-stock', async (req, res) => {
  const { productId, size, decrement } = req.body;
  console.log(productId, size, decrement);

  if (!productId || !size || !decrement) {
    return res.status(400).json({ error: 'Invalid request. Missing required fields.' });
  }

  try {
    const data = await redisClient.get('products');
    const products = JSON.parse(data || '[]');

    const product = products.find((p) => p.id === productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const sizeIndex = product.sizes.indexOf(size);
    if (sizeIndex === -1) {
      return res.status(400).json({ error: 'Size not available for the product.' });
    }

    if (product.stock[sizeIndex] < decrement) {
      return res.status(400).json({ error: 'Insufficient stock.' });
    }

    product.stock[sizeIndex] -= decrement;

    await redisClient.set('products', JSON.stringify(products));

    res.json({ message: 'Stock updated successfully.' });
  } catch (err) {
    console.error('Error updating stock:', err);
    res.status(500).json({ error: 'Failed to update stock.' });
  }
});

app.post('/update-product', async (req, res) => {
  const { id, title, price, imageUrl, company, sizes, stock } = req.body;

  try {
    const data = await redisClient.get('products');
    const products = JSON.parse(data || '[]');

    const productIndex = products.findIndex((p) => p.id === id);

    if (productIndex === -1) {
      return res.status(404).send('Product not found');
    }

    products[productIndex] = {
      ...products[productIndex],
      title,
      price: parseFloat(price),
      imageUrl,
      company,
      sizes: sizes.split(',').map((size) => parseInt(size)),
      stock: stock.split(',').map((s) => parseInt(s)),
    };

    await redisClient.set('products', JSON.stringify(products));

    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Error updating product');
  }
});


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
