const { Rcon } = require("rcon-client");

async function sendRcon({ host, port, password, command, timeoutMs=3000 }){
  const rcon = await Rcon.connect({ host, port, password, timeout: timeoutMs });
  try{
    const res = await rcon.send(command);
    return res ?? "";
  } finally {
    try{ await rcon.end(); }catch{}
  }
}

module.exports = { sendRcon };
