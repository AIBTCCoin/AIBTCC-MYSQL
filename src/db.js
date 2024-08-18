const mysql = require('mysql2');
const db = mysql.createConnection({
  host: 'localhost', 
  port: 3306,        
  user: 'root',
  password: 'g46',
  database: 'blockchain'
});

db.connect(err => {
  if (err) {
    throw err;
  }
  console.log('Connected to database');
});

module.exports = db;


