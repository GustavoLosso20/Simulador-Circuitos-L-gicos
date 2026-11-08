# Simulador Virtual de Circuitos Digitais

Simulador de circuitos lógicos digitais que roda no navegador, com interface **No-Code/Low-Code**: você monta o circuito arrastando componentes, liga os pinos com fios e acompanha os sinais em tempo real. Os esquemáticos podem ser salvos e carregados na nuvem.

Projeto acadêmico de Engenharia da Computação da **Universidade do Vale do Paraíba (Univap)**, desenvolvido para o **INIC 2026** (Encontro Latino Americano de Iniciação Científica).

**Autores:** Gustavo Afonso Losso e João Paulo Guinancio Ferreira.

![Meio somador no simulador](docs/meio-somador.png)

## Funcionalidades

- **Construção visual de circuitos:** adicione componentes por clique ou *drag-and-drop*, posicione-os em uma grade e conecte pinos de saída a pinos de entrada.
- **Simulação em tempo real:** os sinais são recalculados a cada mudança, com fios e pinos em nível alto destacados por cor.
- **Diagrama de tempo:** mostra o histórico recente de chaves, clocks e LEDs.
- **Execução passo a passo:** pause a simulação e avance os clocks manualmente para analisar cada transição.
- **Salvar e carregar na nuvem:** os circuitos são guardados como grafos JSON no MongoDB, por meio de uma API REST.
- **Exemplos prontos:** meio somador, latch SR e contador assíncrono de 2 bits.

### Componentes disponíveis

| Tipo | Componentes |
|---|---|
| Entrada e saída | Chave (0/1), LED, Clock |
| Portas lógicas | AND, OR, NOT, NAND, NOR, XOR |
| Sequenciais | Flip-flop D e flip-flop JK (borda de subida) |

As portas seguem a simbologia da norma IEC 60617.

## Como usar o editor

| Ação | Como fazer |
|---|---|
| Adicionar componente | Clique nele na barra lateral ou arraste-o para o quadro |
| Ligar componentes | Arraste de um pino de saída (direita) até um pino de entrada (esquerda) |
| Alternar uma chave | Clique sobre ela |
| Mover um componente | Arraste-o |
| Selecionar e apagar um fio | Clique no fio e aperte `Delete` ou `Backspace` (ou use o botão direito) |
| Apagar um componente | Selecione e aperte `Delete`, ou use o botão direito |
| Soltar um fio de um pino | Clique no pino de entrada ligado |
| Renomear ou mudar o período do clock | Duplo clique no componente |

## Arquitetura

![Arquitetura do simulador](docs/arquitetura.png)

O front-end em Canvas faz a edição e a simulação no navegador. O back-end é *stateless*: uma API REST em Express que apenas persiste as topologias no MongoDB, por meio do Mongoose. Os tipos do grafo ficam em um módulo compartilhado entre os dois lados.

```
src/
├── shared/     tipos do grafo (nós, fios, pinos) e motor de simulação
├── server/     API Express, modelo Mongoose e rotas
└── client/     interface em Canvas, cliente da API e exemplos
public/         index.html, CSS e JavaScript compilado
```

### Motor de simulação

- **Lógica combinacional:** as saídas são recalculadas por propagação até estabilizar, o que permite circuitos com realimentação, como o latch SR.
- **Lógica sequencial:** os flip-flops reagem à borda de subida do clock e todos amostram suas entradas antes de qualquer saída mudar, o que reproduz o comportamento de registradores.
- **Contadores assíncronos:** bordas geradas pela saída de um flip-flop são tratadas em rodadas seguintes.

O motor foi verificado com testes sobre tabelas-verdade das portas, meio somador, latch SR, flip-flops D e JK, contador de 2 bits e registrador de deslocamento.

![Contador assíncrono de 2 bits](docs/contador-2-bits.png)

## Tecnologias

| Categoria | Tecnologia |
|---|---|
| Ambiente de execução | Node.js 24 ou superior |
| Linguagem | TypeScript |
| Framework web | Express.js |
| Banco de dados | MongoDB (Atlas ou local) |
| ODM | Mongoose |
| Executor TypeScript | tsx |
| Variáveis de ambiente | dotenv |
| Middleware | cors |
| Interface | HTML5 Canvas API |

## Como executar

**Pré-requisitos:** Node.js 24+ e um MongoDB, que pode ser local, em Docker ou um cluster gratuito no [MongoDB Atlas](https://www.mongodb.com/atlas).

```bash
git clone <URL-DO-SEU-REPOSITORIO>
cd <pasta-do-projeto>
npm install
cp .env.example .env     # no Windows (PowerShell): copy .env.example .env
```

Edite o `.env` com a sua string de conexão:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/logic-sim
CORS_ORIGIN=*
```

Para usar o MongoDB Atlas, a string tem este formato:

```env
MONGODB_URI=mongodb+srv://USUARIO:SENHA@SEU-CLUSTER.mongodb.net/logic-sim?appName=Cluster0
```

Para subir um MongoDB local com Docker:

```bash
docker run -d --name mongo-logicsim -p 27017:27017 mongo:7
```

Inicie o projeto:

```bash
npm run dev
```

Abra **http://localhost:3000**.

> **Importante:** o arquivo `.env` guarda credenciais e **não deve ser enviado ao GitHub**. Ele já está no `.gitignore`. No Atlas, libere o seu IP em *Network Access* e use um usuário com senha própria para o projeto.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Compila o front-end e inicia o servidor com reinício automático |
| `npm run dev:client` | Recompila o front-end a cada alteração em `src/client` |
| `npm run build:client` | Compila o front-end uma vez |
| `npm start` | Compila o front-end e inicia o servidor |
| `npm run typecheck` | Verifica os tipos do servidor e do cliente |

Depois de editar o código do front-end, rode `npm run build:client` (ou deixe o `dev:client` aberto) e atualize a página com `Ctrl + F5`.

## API REST

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Estado do servidor e do banco |
| GET | `/api/circuits` | Lista os circuitos salvos |
| GET | `/api/circuits/:id` | Retorna um circuito completo |
| POST | `/api/circuits` | Cria um circuito |
| PUT | `/api/circuits/:id` | Atualiza um circuito |
| DELETE | `/api/circuits/:id` | Remove um circuito |

Formato do corpo das requisições:

```json
{
  "name": "Meio somador",
  "nodes": [
    { "id": "a", "type": "INPUT", "x": 60, "y": 80, "label": "A", "value": true }
  ],
  "wires": [
    { "fromNode": "a", "fromPin": 0, "toNode": "x", "toPin": 0 }
  ]
}
```

O servidor valida os tipos de componente, a unicidade dos identificadores e se cada fio liga pinos que existem.

## Próximos passos

- Registro persistente dos eventos de mudança de estado no banco de dados (valor anterior, valor atual e horário), para análise posterior.
- Novos componentes: flip-flop T, multiplexador e registradores.
- Exportação do circuito como imagem.
- Autenticação por usuário.

## Referência

MATERZOK, M. *DigitalJS: a Visual Verilog Simulator for Teaching*. 2019.

## Licença

Defina aqui a licença do projeto (por exemplo, MIT) e adicione o arquivo `LICENSE` na raiz do repositório.
<img width="1488" height="647" alt="arquitetura" src="https://github.com/user-attachments/assets/ab33958a-3316-4960-81a7-c7768a3d4b1f" />
<img width="1456" height="780" alt="contador-2-bits" src="https://github.com/user-attachments/assets/263b89ff-fcc6-400f-b528-78b1ea6c3fe0" />
<img width="1456" height="860" alt="meio-somador" src="https://github.com/user-attachments/assets/872f06e9-09b9-4e03-b127-3de24618bf53" />


