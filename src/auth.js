const jwt = require("jsonwebtoken");
const { db } = require("./db");
const JWT_SECRET = process.env.JWT_SECRET || "change_me_now";

function sign(user){ return jwt.sign({ uid:user.id, role:user.role }, JWT_SECRET, { expiresIn:"7d" }); }

function requireAuth(req,res,next){
  const hdr = req.headers.authorization || "";
  const m = hdr.match(/^Bearer (.+)$/i);
  if(!m) return res.status(401).json({ok:false,error:"Missing token"});
  try{
    const payload = jwt.verify(m[1], JWT_SECRET);
    const user = db.prepare("SELECT id, username, role FROM users WHERE id=?").get(payload.uid);
    if(!user) return res.status(401).json({ok:false,error:"Invalid token"});
    req.user = user;
    next();
  }catch{
    return res.status(401).json({ok:false,error:"Invalid token"});
  }
}

function requireRole(roles){
  const allowed = new Set(roles);
  return (req,res,next)=>{
    if(!req.user) return res.status(401).json({ok:false,error:"Missing token"});
    if(allowed.has(req.user.role)) return next();
    return res.status(403).json({ok:false,error:"Forbidden"});
  };
}

module.exports = { sign, requireAuth, requireRole };
