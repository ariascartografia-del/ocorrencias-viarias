/*
 * Testes das regras do Firestore (firestore.rules) no emulador local.
 * Não acessa o Firestore de produção.
 *
 *   cd tests && npm install && npm test
 */
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, deleteField,
} from 'firebase/firestore';

let env;
const EQUIPE_UID = 'func1';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ocorrencias',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'equipe', EQUIPE_UID), { nome: 'Funcionário' });
    await setDoc(doc(db, 'ocorrencias', 'existente'), { ...ocorrencia(), createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, 'denunciantes', 'existente'), { nome: 'Maria', telefone: '1899', email: 'm@x.com' });
  });
});

const publico  = () => env.unauthenticatedContext().firestore();
const equipe   = () => env.authenticatedContext(EQUIPE_UID).firestore();
const intruso  = () => env.authenticatedContext('qualquer').firestore(); // logado, mas fora de equipe/

function ocorrencia(extra = {}) {
  return {
    protocolo: '2026-12345', tipo: 'buraco', status: 'pendente',
    lat: -22.12, lng: -51.38, endereco: 'Rua X, Centro', gravidade: 'media',
    dimensao: 'pequeno', tipoVia: 'pista', fluxo: 'alto', desc: 'Buraco grande',
    anonimo: false, fotos: ['https://i.ibb.co/abc/foto.jpg'],
    reparoAnterior: false, protocoloAnterior: '', empresa: '', data: '15/10/2026',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    ...extra,
  };
}

/* Envio igual ao do site: ocorrência + dados pessoais no mesmo batch */
function envio(db, id, oc, den) {
  const b = writeBatch(db);
  b.set(doc(db, 'ocorrencias', id), oc);
  if (den) b.set(doc(db, 'denunciantes', id), { createdAt: serverTimestamp(), ...den });
  return b.commit();
}

/* ── Leitura ── */
test('público lê ocorrências', async () => {
  await assertSucceeds(getDocs(collection(publico(), 'ocorrencias')));
});
test('público NÃO lê denunciantes nem notas', async () => {
  await assertFails(getDoc(doc(publico(), 'denunciantes', 'existente')));
  await assertFails(getDocs(collection(publico(), 'denunciantes')));
  await assertFails(getDocs(collection(publico(), 'notasEquipe')));
});
test('usuário logado fora da equipe NÃO lê denunciantes', async () => {
  await assertFails(getDoc(doc(intruso(), 'denunciantes', 'existente')));
});
test('equipe lê denunciantes', async () => {
  await assertSucceeds(getDoc(doc(equipe(), 'denunciantes', 'existente')));
});
test('cada um só lê o próprio documento em equipe/', async () => {
  await assertSucceeds(getDoc(doc(equipe(), 'equipe', EQUIPE_UID)));
  await assertSucceeds(getDoc(doc(intruso(), 'equipe', 'qualquer')));
  await assertFails(getDoc(doc(intruso(), 'equipe', EQUIPE_UID)));
  await assertFails(getDocs(collection(publico(), 'equipe')));
});
test('ninguém se cadastra em equipe/ pelo site', async () => {
  await assertFails(setDoc(doc(intruso(), 'equipe', 'qualquer'), { nome: 'eu' }));
});

/* ── Criação pública ── */
test('público cria ocorrência com dados pessoais no mesmo batch', async () => {
  await assertSucceeds(envio(publico(), 'nova1', ocorrencia(), { nome: 'João', telefone: '18 9', email: 'j@x.com' }));
});
test('público cria ocorrência anônima sem dados pessoais', async () => {
  await assertSucceeds(envio(publico(), 'nova2', ocorrencia({ anonimo: true })));
});
test('denúncia anônima NÃO pode gravar dados pessoais', async () => {
  await assertFails(envio(publico(), 'nova3', ocorrencia({ anonimo: true }), { nome: 'João' }));
});
test('NÃO aceita dados pessoais (ou CPF) dentro da ocorrência pública', async () => {
  await assertFails(envio(publico(), 'n4', ocorrencia({ denunciante: 'João' })));
  await assertFails(envio(publico(), 'n5', ocorrencia({ cpf: '123' })));
  await assertFails(envio(publico(), 'n6', ocorrencia(), { nome: 'João', cpf: '123' }));
});
test('NÃO cria denunciante solto ou para ocorrência já existente', async () => {
  await assertFails(setDoc(doc(publico(), 'denunciantes', 'solto'), { nome: 'x', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(publico(), 'denunciantes', 'existente'), { nome: 'x', createdAt: serverTimestamp() }));
});
test('validação de campos da ocorrência', async () => {
  const db = publico();
  await assertFails(envio(db, 'v1', ocorrencia({ status: 'resolvido' })));
  await assertFails(envio(db, 'v2', ocorrencia({ tipo: 'outro' })));
  await assertFails(envio(db, 'v3', ocorrencia({ fotos: [] })));
  await assertFails(envio(db, 'v4', ocorrencia({ fotos: ['https://evil.com/x.jpg'] })));
  await assertFails(envio(db, 'v5', ocorrencia({ fotos: ['https://i.ibb.co/a.jpg', 'javascript:alert(1)'] })));
  await assertFails(envio(db, 'v6', ocorrencia({ empresa: 'Construtora' })));
  await assertFails(envio(db, 'v7', ocorrencia({ desc: 'x'.repeat(2001) })));
  await assertFails(envio(db, 'v8', ocorrencia({ lat: 'abc' })));
  await assertFails(envio(db, 'v9', ocorrencia({ createdAt: new Date(2020, 0, 1) })));
  await assertFails(envio(db, 'v10', ocorrencia({ fotoResolucao: 'https://i.ibb.co/a.jpg' })));
});

/* ── Alterações ── */
test('público e intruso NÃO editam nem excluem', async () => {
  for (const db of [publico(), intruso()]) {
    await assertFails(updateDoc(doc(db, 'ocorrencias', 'existente'), { status: 'resolvido' }));
    await assertFails(deleteDoc(doc(db, 'ocorrencias', 'existente')));
    await assertFails(deleteDoc(doc(db, 'denunciantes', 'existente')));
  }
});
test('equipe edita status, notas, resolução e exclui', async () => {
  const db = equipe();
  await assertSucceeds(updateDoc(doc(db, 'ocorrencias', 'existente'), {
    status: 'resolvido', fotoResolucao: 'https://i.ibb.co/r.jpg', observacao: deleteField(),
  }));
  await assertSucceeds(setDoc(doc(db, 'notasEquipe', 'existente'), { observacao: 'ok' }, { merge: true }));
  const b = writeBatch(db);
  ['ocorrencias', 'denunciantes', 'notasEquipe'].forEach(c => b.delete(doc(db, c, 'existente')));
  await assertSucceeds(b.commit());
});
