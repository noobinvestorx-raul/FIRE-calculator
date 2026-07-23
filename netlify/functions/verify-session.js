const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const sessionId = event.queryStringParameters.session_id;
  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta session_id" }) };
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        paid: session.payment_status === "paid",
        email: session.customer_details?.email || session.customer_email,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
