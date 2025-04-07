document.addEventListener("DOMContentLoaded", function() {
    // Elementos da interface
    const chatButton = document.getElementById("chatButton");
    const chatContainer = document.getElementById("chatContainer");
    const closeChat = document.getElementById("closeChat");
    const sendMessage = document.getElementById("sendMessage");
    const userInput = document.getElementById("userInput");
    const chatMessages = document.getElementById("chatMessages");

    // Cache de informações (para evitar consultas repetidas)
    const infoCache = {
        president: null,
        lastUpdated: 0
    };

    // Event listeners
    chatButton.addEventListener("click", () => chatContainer.style.display = "block");
    closeChat.addEventListener("click", () => chatContainer.style.display = "none");
    sendMessage.addEventListener("click", sendUserMessage);
    userInput.addEventListener("keypress", (e) => e.key === "Enter" && sendUserMessage());

    // Função principal
    async function sendUserMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        displayMessage(message, "user");
        userInput.value = "";

        try {
            const response = await generateResponse(message);
            displayMessage(response, "bot");
        } catch (error) {
            console.error("Erro:", error);
            displayMessage("Parece que tive um problema. Vamos tentar novamente?", "bot");
        }
    }

    // Gerador de respostas inteligente
    async function generateResponse(question) {
        const lowerQuestion = question.toLowerCase();

        // 1. Busca no arquivo JSON (agora com lógica para múltiplas formas)
        try {
            const response = await fetch("database.json");
            const data = await response.json();

            for (const item of data) {
                if (Array.isArray(item.pergunta)) {
                    for (const possibleQuestion of item.pergunta) {
                        const lowerPossibleQuestion = possibleQuestion.toLowerCase();
                        // Verificar se todos os termos da pergunta do usuário estão na possível pergunta
                        const questionTerms = lowerQuestion.split(/\s+/);
                        const allTermsPresent = questionTerms.every(term => lowerPossibleQuestion.includes(term));

                        if (allTermsPresent && questionTerms.length > 0) {
                            return item.resposta;
                        }
                    }
                } else if (typeof item.pergunta === 'string') {
                    const lowerPergunta = item.pergunta.toLowerCase();
                    const questionTerms = lowerQuestion.split(/\s+/);
                    const allTermsPresent = questionTerms.every(term => lowerPergunta.includes(term));

                    if (allTermsPresent && questionTerms.length > 0) {
                        return item.resposta;
                    }
                }
            }
        } catch (error) {
            console.error("Erro ao buscar resposta no JSON:", error);
        }

        // 2. Busca nas respostas pré-definidas
        const predefined = {
            "olá": "Olá! Como posso te ajudar hoje? ",
            "oi": "Oi! Estou aqui para responder suas perguntas!",
            "tudo bem": "Estou ótimo! E com você?",
            "quem é você": "Sou seu assistente virtual inteligente! Posso te informar sobre diversos assuntos."
        };

        if (predefined[lowerQuestion]) return predefined[lowerQuestion];

        // 3. Busca nas outras fontes de dados
        const questionType = identifyQuestionType(question);

        switch (questionType) {
            case "current_president":
                return await getCurrentPresident();

            case "current_government":
                return await getGovernmentInfo();

            case "fact_check":
                return await verifyFact(question);

            default:
                const webAnswer = await searchComprehensiveAnswer(question);
                const shouldPrompt = webAnswer.includes("Não encontrei informações precisas sobre isso");
                if (shouldPrompt) {
                    const userAnswer = prompt("Ainda não sei essa resposta, poderia me responder para as próximas vezes?");
                    if (userAnswer) {
                        await addQuestionAnswerToJson({ pergunta: [question], resposta: userAnswer });
                        return userAnswer;
                    } else {
                        return "Desculpe, não encontrei uma resposta precisa. Você pode tentar reformular sua pergunta?";
                    }
                }
                return webAnswer;
        }
    }
    async function addQuestionAnswerToJson(newEntry) {
        try {
            const response = await fetch("database.json");
            const data = await response.json();
            data.push(newEntry); // Adiciona uma nova entrada com um array de pergunta
            await fetch("database.json", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            console.log("Nova entrada adicionada ao JSON.");
        } catch (error) {
            console.error("Erro ao adicionar entrada ao JSON:", error);
        }
    }

    // Identifica o tipo de pergunta
    function identifyQuestionType(question) {
        const lowerQ = question.toLowerCase();

        if (/presidente|atual|hoje|quem é o presidente|mandatário|governante/.test(lowerQ) &&
            /brasil|brasileiro|nacional|país/.test(lowerQ)) {
            return "current_president";
        }

        if (/ministro|governo|atual|equipe|ministério/.test(lowerQ) &&
            /federal|brasil|governo/.test(lowerQ)) {
            return "current_government";
        }

        if (/verdade|verificar|confirmar|checar|fato/.test(lowerQ)) {
            return "fact_check";
        }

        return "general";
    }

    // Busca informações sobre o presidente atual
    async function getCurrentPresident() {
        // Verifica se tem no cache (válido por 1 dia)
        if (infoCache.president && (Date.now() - infoCache.lastUpdated < 86400000)) {
            return infoCache.president;
        }

        try {
            // Método 1: Wikipedia Oficial (Web Scraping indireto via API)
            const wikiResponse = await fetch(
                "https://pt.wikipedia.org/api/rest_v1/page/html/Presidente_do_Brasil",
                { headers: { "User-Agent": "Mozilla/5.0" } }
            );

            const html = await wikiResponse.text();
            const tempElement = document.createElement('div');
            tempElement.innerHTML = html;

            // Extrai a informação do infobox (formato padrão da Wikipedia)
            const infobox = tempElement.querySelector('.infobox');
            if (infobox) {
                const rows = infobox.querySelectorAll('tr');
                for (const row of rows) {
                    if (row.textContent.includes("Atual") || row.textContent.includes("atual")) {
                        const presidentInfo = row.textContent
                            .replace(/\s+/g, ' ')
                            .replace(/\[.*?\]/g, '')
                            .trim();

                        infoCache.president = `🤵 ${presidentInfo.replace("Atual", "Atual:")}`;
                        infoCache.lastUpdated = Date.now();
                        return infoCache.president;
                    }
                }
            }

            // Método 2: Dados Governamentais (Portal Brasil)
            const govResponse = await fetch("https://www.gov.br/planalto/pt-br");
            const govHtml = await govResponse.text();
            const govElement = document.createElement('div');
            govElement.innerHTML = govHtml;

            const presidentName = govElement.querySelector(".president-name")?.textContent.trim();
            if (presidentName) {
                infoCache.president = `🤵 O Presidente do Brasil atualmente é ${presidentName}. (Fonte: Portal Brasil)`;
                infoCache.lastUpdated = Date.now();
                return infoCache.president;
            }

            // Método 3: Fallback estático (atualize manualmente se necessário)
            infoCache.president = "🤵 O Presidente do Brasil atualmente é Luiz Inácio Lula da Silva (desde 1° de janeiro de 2023).";
            infoCache.lastUpdated = Date.now();
            return infoCache.president;

        } catch (error) {
            console.error("Erro ao buscar presidente:", error);
            return "🤵 O Presidente do Brasil atualmente é Luiz Inácio Lula da Silva (desde 1° de janeiro de 2023).";
        }
    }

    // Busca respostas abrangentes
    async function searchComprehensiveAnswer(question) {
        try {
            // Tenta Wikipedia primeiro
            const wikiResponse = await fetch(
                `https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(question)}`,
                { headers: { "User-Agent": "AssistenteVirtual/1.0" } }
            );

            const wikiData = await wikiResponse.json();
            const pages = wikiData.query.pages;
            const pageId = Object.keys(pages)[0];

            if (pageId !== "-1" && pages[pageId].extract) {
                const answer = pages[pageId].extract.split('\n')[0];
                return `${answer.substring(0, 250)}... (Fonte: Wikipedia)`;
            }

            // Fallback para busca na web
            return await searchWebAnswer(question);
        } catch (e) {
            console.error("Erro na busca:", e);
            return "Não encontrei informações precisas sobre isso. Poderia reformular ou ser mais específico?";
        }
    }

    // Busca genérica na web
    async function searchWebAnswer(question) {
        try {
            // Usa um serviço de busca genérico
            const response = await fetch(
                `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.google.com/search?q=${encodeURIComponent(question)}+site:.gov.br`)}`
            );

            const data = await response.json();
            const html = data.contents;

            if (html.includes("Presidente do Brasil")) {
                const start = html.indexOf("Presidente do Brasil");
                const snippet = html.substring(start, start + 200);
                return snippet.replace(/<.*?>/g, '') + "... (Fonte: sites oficiais)";
            }

            return "Não encontrei informações precisas sobre isso. Poderia reformular ou ser mais específico?";
        } catch (e) {
            console.error("Erro na busca web:", e);
            return "Não consegui acessar minhas fontes no momento. Tente novamente mais tarde.";
        }
    }

    // Exibe mensagens com efeito natural
    function displayMessage(text, sender) {
        const messageDiv = document.createElement("div");
        messageDiv.className = sender;

        if (sender === "bot") {
            messageDiv.innerHTML = '<span class="typing-indicator">✍️ Pesquisando...</span>';
            chatMessages.appendChild(messageDiv);

            let i = 0;
            const typing = setInterval(() => {
                messageDiv.innerHTML = `Assistente: ${text.substring(0, i)}<span class="cursor">|</span>`;
                chatMessages.scrollTop = chatMessages.scrollHeight;
                i++;
                if (i > text.length) {
                    clearInterval(typing);
                    messageDiv.innerHTML = `Assistente: ${text}`;
                }
            }, 20);
        } else {
            messageDiv.textContent = `Você: ${text}`;
            chatMessages.appendChild(messageDiv);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Estilo adicional
    const style = document.createElement('style');
    style.textContent = `
        .cursor { animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        .typing-indicator { color: #666; font-style: italic; }
        .bot { color: #1a73e8; }
        .user { color: #34a853; }
    `;
    document.head.appendChild(style);

    // Pré-carrega informações importantes
    getCurrentPresident().catch(() => {});
});
document.addEventListener("DOMContentLoaded", function() {
    const startRecognition = document.getElementById("startRecognition");
    const micIcon = document.getElementById("micIcon");
    const voiceStatus = document.getElementById("voiceStatus");
    const permissionNotification = document.getElementById("permissionNotification");
    const userInput = document.getElementById("userInput");

    // Verifica se a API Web Speech é suportada
    if ("webkitSpeechRecognition" in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.lang = "pt-BR";

        recognition.onstart = function() {
            micIcon.src = "img/mic.jpg";
            voiceStatus.textContent = "Ouvindo...";
        };

        recognition.onend = function() {
            micIcon.src = "img/mic.jpg";
            voiceStatus.textContent = "";
        };

        recognition.onresult = function (event) {
            const transcript = event.results[event.results.length - 1][0].transcript;
            userInput.value = transcript;
        };

        recognition.onerror = function (event) {
            console.error("Erro no reconhecimento de voz:", event.error);
            if (event.error === "not-allowed") {
                permissionNotification.classList.remove("hidden");
            }
        };

        startRecognition.addEventListener("click", () => {
            permissionNotification.classList.add("hidden");
            recognition.start();
        });
    } else {
        startRecognition.style.display = "none";
        voiceStatus.textContent = "Recurso não suportado";
    }
});
const clearHistory = document.getElementById("clearHistory");
const chatMessages = document.getElementById("chatMessages");

clearHistory.addEventListener("click", () => {
    chatMessages.innerHTML = ""; // Limpa o conteúdo do chatMessages
});

function setupHamburgerMenus() {
    // Elementos dos menus
    const leftHamburger = document.getElementById('leftHamburger');
    const rightHamburger = document.getElementById('rightHamburger');
    const leftMenu = document.querySelector('.left-menu');
    const rightMenu = document.querySelector('.right-menu');

    // Seleciona os atalhos de SUPORTE (esquerda)
    const supportLinks = document.querySelectorAll('.coluna_lateral:first-child .linha');

    // Seleciona os atalhos de CONHECIMENTO (direita)
    const knowledgeLinks = document.querySelectorAll('.coluna_lateral:last-child .linha');

    // Preenche o menu esquerdo (SUPORTE)
    supportLinks.forEach(linha => {
        const clone = linha.cloneNode(true);
        // Ajusta os estilos para o menu
        clone.querySelectorAll('.link-card').forEach(card => {
            card.style.margin = '5px 0';
            card.style.width = '100%';
        });
        clone.querySelectorAll('.text_ex').forEach(text => {
            text.style.margin = '5px 0 15px 0';
        });
        clone.style.flexDirection = 'column';
        leftMenu.appendChild(clone);
    });

    // Preenche o menu direito (CONHECIMENTO)
    knowledgeLinks.forEach(linha => {
        const clone = linha.cloneNode(true);
        // Ajusta os estilos para o menu
        clone.querySelectorAll('.link-card').forEach(card => {
            card.style.margin = '5px 0';
            card.style.width = '100%';
        });
        clone.querySelectorAll('.text_ex').forEach(text => {
            text.style.margin = '5px 0 15px 0';
        });
        clone.style.flexDirection = 'column';
        rightMenu.appendChild(clone);
    });

    // Event listeners para abrir/fechar menus
    leftHamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        leftMenu.classList.toggle('hidden');
        rightMenu.classList.add('hidden');
    });

    rightHamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        rightMenu.classList.toggle('hidden');
        leftMenu.classList.add('hidden');
    });

    // Fecha menus ao clicar em qualquer lugar da página
    document.addEventListener('click', () => {
        leftMenu.classList.add('hidden');
        rightMenu.classList.add('hidden');
    });

    // Impede que o clique nos menus feche eles mesmos
    leftMenu.addEventListener('click', (e) => e.stopPropagation());
    rightMenu.addEventListener('click', (e) => e.stopPropagation());
}

// Chame a função quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    setupHamburgerMenus();
});