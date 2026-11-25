type Turn={role:'user'|'assistant';content:string};
export async function aiReply(message:string,history:Turn[]):Promise<string>{
 const provider=(process.env.DEFAULT_AI_PROVIDER||'groq').toLowerCase();
 if(provider==='gemini' && process.env.GEMINI_API_KEY){
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:'You are Karen, a careful personal assistant. Reply in natural Thanglish when appropriate. Never claim access to unconnected accounts or files. Ask before sending messages or revealing sensitive personal data.'}]},contents:[...history.map(t=>({role:t.role==='assistant'?'model':'user',parts:[{text:t.content}]})),{role:'user',parts:[{text:message}]}]})});
  if(!r.ok) throw new Error(`Gemini request failed (${r.status})`);
  const j:any=await r.json(); return j.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join('')||'I could not create a response.';
 }
 if(process.env.GROQ_API_KEY){
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${process.env.GROQ_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:'You are Karen, a careful personal assistant. Reply in natural Thanglish when appropriate. Never claim access to unconnected accounts or files. Ask before sending messages or revealing sensitive personal data.'},...history,{role:'user',content:message}]})});
  if(!r.ok) throw new Error(`Groq request failed (${r.status})`);
  const j:any=await r.json(); return j.choices?.[0]?.message?.content||'I could not create a response.';
 }
 throw new Error('Configure GEMINI_API_KEY or GROQ_API_KEY on the server.');
}
