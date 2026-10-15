# ocorrencias-viarias
Sistema de denúncia de buracos - Presidente Prudente

Site estático (`index.html` = `ocorrencias_viarias.html`) com Firebase Firestore + Auth, fotos no ImgBB e mapa Leaflet.

## Como os dados ficam guardados

| Coleção | O que tem | Quem lê | Quem grava |
|---|---|---|---|
| `ocorrencias/{id}` | tipo, local, fotos, status, descrição (**sem dados pessoais**) | todos | público só **cria**, com campos validados; editar e excluir só a equipe |
| `denunciantes/{id}` | nome, telefone, e-mail de quem denunciou (mesmo `id` da ocorrência) | só a equipe | público cria junto com a ocorrência; denúncia anônima não grava nada |
| `notasEquipe/{id}` | observações internas | só a equipe | só a equipe |
| `equipe/{uid}` | lista de quem é da equipe | o próprio usuário | **só pelo console** |

As regras ficam em [`firestore.rules`](firestore.rules). O CPF deixou de ser coletado.

## Implantação (fazer nesta ordem)

### 1. Ativar o login da equipe
1. [Firebase Console](https://console.firebase.google.com/project/ocorrencias-viarias/authentication) → **Authentication** → *Primeiros passos* → *Método de login* → ative **E-mail/senha**.
2. Recomendado: em **Authentication → Configurações → Ações do usuário**, desmarque **Ativar criação (inscrição)**. Assim só você cria contas. Mesmo sem isso, quem criar conta sozinho não vira equipe (passo 2).

### 2. Criar os usuários da equipe
Para cada pessoa:
1. **Authentication → Usuários → Adicionar usuário**: informe o e-mail e uma senha inicial. Copie o **UID** que aparece na lista.
2. **Firestore Database → Iniciar coleção** (ou abra a coleção `equipe`): ID da coleção `equipe`, **ID do documento = o UID copiado**, campo `nome` (string) com o nome da pessoa.

Para tirar alguém da equipe, apague o documento `equipe/{uid}` (e, se quiser, o usuário em Authentication).
Para trocar a senha: Authentication → Usuários → ⋮ → *Redefinir senha*.

### 3. Publicar o site
Faça o merge do PR na `main`. O GitHub Pages publica sozinho.

### 4. Publicar as regras do Firestore
Publique as regras **depois** que o site novo estiver no ar. As regras recusam o formato antigo de envio (com CPF no documento), então quem estiver com a página velha aberta precisa recarregar.

Opção A, pelo console: **Firestore Database → Regras**, cole o conteúdo de `firestore.rules` e clique em **Publicar**.

Opção B, pela linha de comando (Node.js instalado), na pasta do repositório:
```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project ocorrencias-viarias
```

### 5. Migrar as denúncias antigas (uma vez só)
As ocorrências gravadas antes desta versão têm nome, CPF, telefone e e-mail **dentro do documento público**. As regras não conseguem esconder só alguns campos, então esses dados continuam públicos até serem migrados:

1. Abra o site, clique em **Equipe** no menu e entre.
2. Vá em **Painel**. Aparece o aviso *"N ocorrência(s) antigas ainda têm dados pessoais…"*. Clique em **Migrar agora**.
3. Nome, telefone e e-mail vão para `denunciantes`, a observação vai para `notasEquipe`, e o CPF é apagado. Em denúncias que estavam marcadas como anônimas, os dados pessoais são descartados.

### 6. Trocar a chave do ImgBB
A chave atual está no código público desde o início. Gere uma nova em <https://api.imgbb.com/>, troque `IMGBB_KEY` nos dois HTML e desative a antiga.

## Fotos: ImgBB × Firebase Storage
Por enquanto as fotos continuam no ImgBB. A chave dele precisa ficar no navegador, então qualquer pessoa pode usá-la para subir imagens na conta, mas isso não expõe dados pessoais: as fotos já são públicas. As regras só aceitam links `https://i.ibb.co/…`.

Migrar para o **Firebase Storage** permitiria regras próprias (público só envia imagem de até ~2 MB, só a equipe apaga) e acabaria com a chave exposta. Mas o Storage exige o plano **Blaze** (pago por uso, com cota gratuita). Se o plano for ativado, a migração é: criar o bucket, escrever `storage.rules` e trocar `uploadFoto()`. As fotos antigas podem continuar no ImgBB.

## Testes (local, sem tocar na produção)
Exigem Node.js 18+ e Java 21+ (para o emulador do Firebase).

Testes automáticos das regras:
```bash
cd tests && npm install && npm test
```

Para testar o site completo contra o emulador:
```bash
cd tests && npx firebase emulators:start --only firestore,auth --project ocorrencias-viarias
```
Em outro terminal:
```bash
cd tests && node seed-emulador.mjs
```
```bash
npx http-server -p 5500 -c-1 .
```
Depois abra <http://localhost:5500/?emulador>. Com `?emulador` em `localhost`, o site usa o Firestore e o Auth locais e **não** envia fotos ao ImgBB. O login de teste da equipe está em `tests/seed-emulador.mjs`.
