/*
 * Popula o EMULADOR local para testar o site em http://localhost:5500/?emulador
 * Só fala com 127.0.0.1 (emulador); nunca com a produção.
 *
 *   npx firebase emulators:start --only firestore,auth --project ocorrencias-viarias
 *   node seed-emulador.mjs
 *
 * Login de teste da equipe (só existe no emulador): equipe@teste.local / senha-emulador-1
 */
const PROJETO = 'ocorrencias-viarias';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJETO}/databases/(default)/documents`;
const ADMIN = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }; // ignora as regras

async function criarUsuario(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.localId) throw new Error(JSON.stringify(j));
  return j.localId;
}

const s = v => ({ stringValue: v });
async function gravar(caminho, campos) {
  const r = await fetch(`${FS}/${caminho}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: campos }) });
  if (!r.ok) throw new Error(await r.text());
}

const uid = await criarUsuario('equipe@teste.local', 'senha-emulador-1');
await criarUsuario('intruso@teste.local', 'senha-emulador-1'); // logado, mas fora de equipe/
await gravar(`equipe/${uid}`, { nome: s('Equipe teste') });

/* Ocorrência no formato antigo (dados pessoais e CPF no documento público) */
const agora = { timestampValue: new Date().toISOString() };
await gravar('ocorrencias/antiga1', {
  protocolo: s('2026-00001'), tipo: s('buraco'), status: s('pendente'),
  lat: { doubleValue: -22.1209 }, lng: { doubleValue: -51.3883 },
  endereco: s('Av. Washington Luiz, Centro'), gravidade: s('alta'), desc: s('Ocorrência antiga'),
  denunciante: s('Fulano Antigo'), cpf: s('123.456.789-00'), telefone: s('(18) 99999-0000'),
  email: s('fulano@exemplo.com'), anonimo: { booleanValue: false }, observacao: s('nota antiga'),
  fotos: { arrayValue: { values: [] } }, data: s('01/10/2026'), createdAt: agora, updatedAt: agora,
});
await gravar('ocorrencias/antiga2', {
  protocolo: s('2026-00002'), tipo: s('afunda'), status: s('pendente'),
  lat: { doubleValue: -22.1250 }, lng: { doubleValue: -51.3850 },
  endereco: s('Rua anônima'), gravidade: s('baixa'), desc: s('Antiga anônima'),
  denunciante: s('Anônimo Antigo'), cpf: s('999.999.999-99'), telefone: s(''), email: s(''),
  anonimo: { booleanValue: true }, fotos: { arrayValue: { values: [] } },
  data: s('02/10/2026'), createdAt: agora, updatedAt: agora,
});
console.log('Emulador populado. Equipe uid:', uid);
