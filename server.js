require('dotenv').config();
const express = require('express');
const path = require('path');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// BUG-001: fail-fast se token não configurado
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) {
  console.error('ERRO: MP_ACCESS_TOKEN não configurado. Defina a variável de ambiente.');
  process.exit(1);
}

app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// BUG-002: rate limiting no endpoint de pagamento
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
});

// URL base do site (usa variável de ambiente ou monta a partir do request)
const SITE_URL = process.env.SITE_URL || null;

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });

// Rota para criar preferência de pagamento (Checkout Pro)
app.post('/api/create-preference', paymentLimiter, async (req, res) => {
  const { title, price, id } = req.body;

  if (!title || !price || !id) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  // BUG-003/027: validação server-side do preço
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 1 || numPrice > 10000) {
    return res.status(400).json({ error: 'Valor inválido. Mínimo R$1, máximo R$10.000.' });
  }

  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: String(id),
            title: title,
            quantity: 1,
            unit_price: numPrice,
            currency_id: 'BRL',
          }
        ],
        payment_methods: {
          excluded_payment_types: [],
          installments: 12,
        },
        back_urls: {
          success: `${SITE_URL || req.protocol + '://' + req.get('host')}/?status=approved`,
          failure: `${SITE_URL || req.protocol + '://' + req.get('host')}/?status=failure`,
          pending: `${SITE_URL || req.protocol + '://' + req.get('host')}/?status=pending`,
        },
        auto_return: 'approved',
      }
    });

    res.json({ init_point: result.init_point });
  } catch (err) {
    console.error('Erro ao criar preferência:', err);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chá de Panela rodando na porta ${PORT}`);
});
