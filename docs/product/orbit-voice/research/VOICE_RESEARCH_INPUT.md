# Voice research supplied by the owner

Received 28 October 2026. Source: uploaded “Pasted text.txt”. Preserved below for architecture traceability. Vendor capabilities, API names, links and recommendations in this input have not been independently verified by this requirements package. The BRD and requirements define the proposed product scope.

---

Yes—you can build a **ChatGPT-style coach inside RacePredictor**, including ongoing text conversations, microphone input, spoken replies, and live voice conversations. Your app can supply the athlete’s training context automatically in the background.

The distinction is that you would be building your own coaching experience using AI APIs. Connecting an OpenAI API key does **not automatically bring across your personal ChatGPT conversations, memory, or custom instructions**. RacePredictor would manage its own coaching history and context.

I’m assuming “OpenRoute” means **OpenRouter**.

There are four main experiences you can offer:

| Experience | What the athlete does | How it works |
|---|---|---|
| **Text conversation** | Types messages and asks follow-up questions | A continuing chat with previous messages available to the coach. |
| **Microphone dictation** | Speaks instead of typing | Speech becomes text, which enters the same chat. You can let the athlete review it before sending. |
| **Voice messages and spoken replies** | Records a message, then hears the answer | Speech → text → coaching AI → generated speech. This works as a turn-by-turn conversation. |
| **Live voice conversation** | Talks naturally with the coach | A live audio session handles conversational timing and interruptions. |

OpenAI supports both the separate speech/text stages and live voice approaches. These are different implementations; adding a microphone alone does not create a live conversation. [Official voice documentation](https://developers.openai.com/api/docs/guides/voice-agents).

**You can provide coaching context with every option.**

For example, when you open a chat from a workout and say, “That felt much harder than expected,” RacePredictor could automatically provide:

- The selected workout’s planned and actual results.
- Your current training plan and target race.
- Recent training load and relevant recovery information.
- Your coaching preferences and previous relevant discussions.

You would not need to paste those details into the conversation.

There are two complementary ways to do this: **supply a relevant context summary upfront**, and **give the coach tools to fetch additional information when needed**. For example, the coach could request your last four weeks of training before answering a question about fatigue. Your application retrieves the data and returns it to the model. This is the purpose of function calling. [Official tool documentation](https://developers.openai.com/api/docs/guides/function-calling).

Conversation history and athlete memory should also be treated separately. History captures what was said in a particular chat; athlete memory captures lasting facts and preferences that should apply across chats. OpenAI offers persistent conversation support, or your app can store and supply its own history. For flexibility between providers, I would keep the main coaching records in RacePredictor’s database. [Conversation state documentation](https://developers.openai.com/api/docs/guides/conversation-state).

For implementation, you have several choices:

**Build your own chat interface.**

This gives you control over workout cards, suggested questions, saved conversations, and switching between OpenAI and OpenRouter. For RacePredictor, this would be my preferred starting point because the chat can fit closely into your existing training screens.

**Use an embeddable chat component.**

OpenAI’s **ChatKit** provides a customizable chat interface with features such as attachments and tool interactions. Its current guidance for new applications is to connect it to your own server implementation. This can save interface work, although it still needs your coaching logic and data connections. [ChatKit documentation](https://developers.openai.com/api/docs/guides/chatkit).

**Add live voice through OpenAI.**

There are currently two relevant approaches:

- **Realtime API:** one model handles audio, reasoning, and tools within the session.
- **GPT-Live:** a voice layer handles the conversation while a separate backend handles coaching reasoning and data access. With client delegation, your app can choose that backend independently. This could allow an OpenAI voice interface to use your existing OpenRouter coaching backend, with your app connecting the two. [Voice architecture options](https://developers.openai.com/api/docs/guides/voice-agents), [GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation).

**Use OpenRouter for text and staged voice.**

OpenRouter also provides speech-to-text and text-to-speech endpoints, alongside compatible audio models. That supports a flexible voice-message pipeline. You should check the selected model’s capabilities separately before assuming it supports the live conversational experience you want. [OpenRouter audio options](https://openrouter.ai/blog/announcements/announcing-audio-apis/).

**My recommendation for RacePredictor:** start with a persistent coach chat that supports typing, microphone dictation, and optional spoken replies. Let athletes open either a general coaching conversation or a discussion attached to a specific workout. Use the same coaching context and history throughout.

Then add a **“Talk to coach”** live voice mode using that same coaching backend. This lets text and voice feel like two ways of speaking to the same coach. Keep API keys on your server, and make proposed training-plan changes reviewable before the app saves them.