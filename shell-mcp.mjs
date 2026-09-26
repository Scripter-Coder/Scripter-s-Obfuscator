
import { spawn } from 'child_process';
import fs from 'fs';

function send(obj){ process.stdout.write(JSON.stringify(obj)+'\n'); }

let buffer='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk=>{
  buffer+=chunk;
  let lines=buffer.split('\n');
  buffer=lines.pop();
  for(const line of lines){
    if(!line.trim()) continue;
    let msg;
    try{ msg=JSON.parse(line); }catch(e){ continue; }
    handle(msg);
  }
});

function handle(msg){
  const id = msg.id;
  const method = msg.method;
  const params = msg.params;
  if(method==='initialize'){
    send({jsonrpc:'2.0', id, result:{protocolVersion:'2024-11-05', capabilities:{tools:{}}, serverInfo:{name:'shell-mcp', version:'1.0.0'}}});
    return;
  }
  if(method==='notifications/initialized'){
    return;
  }
  if(method==='tools/list'){
    send({jsonrpc:'2.0', id, result:{tools:[
      {name:'bash', description:'Execute shell command', inputSchema:{type:'object', properties:{command:{type:'string', description:'Command to execute'}, workdir:{type:'string'}}, required:['command']}},
      {name:'list_dir', description:'List directory', inputSchema:{type:'object', properties:{path:{type:'string'}}, required:['path']}},
      {name:'read_file', description:'Read file', inputSchema:{type:'object', properties:{path:{type:'string'}}, required:['path']}},
    ]}});
    return;
  }
  if(method==='tools/call'){
    const name = params.name;
    const args = params.arguments || {};
    if(name==='bash'){
      const cmd = args.command;
      const cwd = args.workdir || process.cwd();
      const child = spawn('powershell.exe', ['-Command', cmd], {cwd, shell:false});
      let stdout='', stderr='';
      child.stdout.on('data', d=> stdout+=d.toString());
      child.stderr.on('data', d=> stderr+=d.toString());
      child.on('close', code=>{
        const text = `EXIT:${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        send({jsonrpc:'2.0', id, result:{content:[{type:'text', text}]}});
      });
      child.on('error', err=>{
        send({jsonrpc:'2.0', id, result:{content:[{type:'text', text:'ERROR: '+err.message}]}});
      });
      return;
    }
    if(name==='list_dir'){
      try{
        const entries = fs.readdirSync(args.path, {withFileTypes:true});
        const text = entries.map(e=> (e.isDirectory()?'[DIR] ':'[FILE] ')+e.name).join('\n');
        send({jsonrpc:'2.0', id, result:{content:[{type:'text', text}]}});
      }catch(e){
        send({jsonrpc:'2.0', id, result:{content:[{type:'text', text:'ERROR: '+e.message}]}});
      }
      return;
    }
    if(name==='read_file'){
      try{
        const content = fs.readFileSync(args.path, 'utf8');
        send({jsonrpc:'2.0', id, result:{content:[{type:'text', text:content.slice(0,20000)}]}});
      }catch(e){
        send({jsonrpc:'2.0', id, result:{content:[{type:'text', text:'ERROR: '+e.message}]}});
      }
      return;
    }
    send({jsonrpc:'2.0', id, error:{code:-32601, message:'unknown tool '+name}});
    return;
  }
  if(id!==undefined){
    send({jsonrpc:'2.0', id, error:{code:-32601, message:'unknown method '+method}});
  }
}
process.stderr.write('shell-mcp started\n');
