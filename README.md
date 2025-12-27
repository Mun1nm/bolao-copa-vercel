# Bolão da Copa - Plataforma de Palpites

Este projeto é uma aplicação web desenvolvida para o gerenciamento de bolões de futebol. A plataforma permite que usuários criem ligas personalizadas, convidem amigos, registrem palpites para os jogos e acompanhem o ranking de pontuação em tempo real.

O projeto foi desenvolvido com foco em performance, responsividade e facilidade de uso.

## Tecnologias Utilizadas

* **Frontend:** React.js, Vite
* **Roteamento:** React Router Dom
* **Backend as a Service:** Firebase (Authentication, Firestore Database)
* **Estilização:** CSS3 (Grid e Flexbox)
* **Hospedagem:** Vercel

## Funcionalidades

* **Autenticação:** Login social seguro utilizando Google (Firebase Auth).
* **Gestão de Bolões:** Criação de ligas com nome, descrição, regras e valor de entrada definidos pelo criador.
* **Sistema de Convites:** Links de compartilhamento únicos para entrada em ligas privadas.
* **Palpites:** Interface intuitiva para registrar placares dos jogos.
* **Ranking Automatizado:** Cálculo de pontuação e ordenação dos participantes baseada nos resultados oficiais.
* **Resultados:** Visualização dos placares oficiais dos jogos (agrupados por data ou grupo).
* **Responsividade:** Layout adaptável para dispositivos móveis e desktop.
* **Painel Administrativo:** Área para cadastro e atualização dos resultados reais dos jogos (acesso restrito).

## Pré-requisitos

Antes de começar, você precisará ter instalado:
* Node.js (versão 14 ou superior)
* NPM ou Yarn

## Instalação e Execução Local

1.  Clone este repositório:
    ```bash
    git clone [https://github.com/Mun1nm/bolao-copa-vercel.git](https://github.com/Mun1nm/bolao-copa-vercel.git)
    ```

2.  Acesse a pasta do projeto:
    ```bash
    cd bolao-copa-vercel
    ```

3.  Instale as dependências:
    ```bash
    npm install
    ```

4.  Configure as variáveis de ambiente (veja a seção abaixo).

5.  Execute o projeto em modo de desenvolvimento:
    ```bash
    npm run dev
    ```

## Configuração de Variáveis de Ambiente

Para que o projeto se conecte corretamente ao Firebase, é necessário criar um arquivo `.env` na raiz do projeto. Este arquivo não deve ser versionado no Git.

Crie o arquivo `.env` e preencha com as credenciais do seu projeto Firebase:

```env
VITE_API_KEY=sua_api_key
VITE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_PROJECT_ID=seu_project_id
VITE_STORAGE_BUCKET=seu_bucket.app
VITE_MESSAGING_SENDER_ID=seu_sender_id
VITE_APP_ID=seu_app_id