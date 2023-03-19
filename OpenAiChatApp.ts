import {
    IAppAccessors,
    IConfigurationExtend,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import {
    IMessage,
    IPostMessageSent,
} from "@rocket.chat/apps-engine/definition/messages";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import { RoomType } from "@rocket.chat/apps-engine/definition/rooms";
import {
    IUIKitResponse,
    UIKitActionButtonInteractionContext,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import { OpenAIChatCommand } from "./commands/OpenAIChatCommand";
import { buttons } from "./config/Buttons";
import { settings } from "./config/Settings";
import { ActionButtonHandler } from "./handlers/ActionButtonHandler";
import { ViewSubmitHandler } from "./handlers/ViewSubmit";
import { OpenAiCompletionRequest } from "./lib/RequestOpenAiChat";
import { sendDirect } from "./lib/SendDirect";
import { sendMessage } from "./lib/SendMessage";
import { sendNotification } from "./lib/SendNotification";
import { DirectContext } from "./persistence/DirectContext";

export class OpenAiChatApp extends App implements IPostMessageSent {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend) {
        await configuration.slashCommands.provideSlashCommand(
            new OpenAIChatCommand(this)
        );
        // Providing persistant app settings
        await Promise.all(
            settings.map((setting) =>
                configuration.settings.provideSetting(setting)
            )
        );
        // Registering Action Buttons
        await Promise.all(
            buttons.map((button) => configuration.ui.registerButton(button))
        );
    }
    // register ActionButton Handler
    public async executeActionButtonHandler(
        context: UIKitActionButtonInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<IUIKitResponse> {
        // lets just move this execution to another file to keep DemoApp.ts clean.
        return new ActionButtonHandler().executor(
            this,
            context,
            read,
            http,
            persistence,
            modify,
            this.getLogger()
        );
    }
    // register SubmitView Handler
    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ) {
        // same for View SubmitHandler, moving to another Class
        return new ViewSubmitHandler().executor(
            this,
            context,
            read,
            http,
            persistence,
            modify,
            this.getLogger()
        );
    }
    // register hook to answer directs
    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        const { text, editedAt, room, sender } = message;
        // we only want direct with the app username
        var bot_user = await read.getUserReader().getAppUser();
        var context: any;
        if (
            bot_user &&
            message.room.type == RoomType.DIRECT_MESSAGE && // direct messages
            message.room.userIds?.includes(bot_user?.id) // that has bot_user id
            // bot_user?.id !== sender.id // and was not sent by the bot itself
        ) {
            if(bot_user?.id == sender.id && message.threadId){
                // this the bot answer, get the actual context and store it
                context_data = await DirectContext.get(read, message.threadId)
                context = context_data[0]["context"]
                context.push(
                    { role: "assistant", content: message.text }
                )
                await DirectContext.update(
                    persistence, message.threadId, context
                )
                return;
            }
            // get thread id
            // discover is there any context for this thread
            if (message.threadId) {
                // message from inside a thread
                // get context, and push to it
                var context_data = await DirectContext.get(
                    read,
                    message.threadId
                );
                context = context_data[0]["context"]
                context.push({ role: "user", content: message.text })
                // update context on persistence
                await DirectContext.update(persistence, message.threadId, context);
            } else {
                // no thread id, first message, initiating context
                var context = [{ role: "user", content: message.text }] as any;
                // update context
                if (message.id) {
                    await DirectContext.update(persistence, message.id, context);
                }
            }
            const result = await OpenAiCompletionRequest(
                this,
                http,
                read,
                context,
                sender
            );
            if (result.success) {
                var markdown_message =
                    result.content.choices[0].message.content;
                sendDirect(sender, read, modify, markdown_message, message.threadId || message.id);
            } else {
                sendNotification(
                    modify,
                    room,
                    sender,
                    `**Error!** Could not Request Completion:\n\n` +
                        result.content.error.message
                );
            }
        }

        return;
    }
}
