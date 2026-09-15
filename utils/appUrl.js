// The app's public address for links in emails: APP_URL, or else the domain that served the request
module.exports = req => process.env.APP_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
