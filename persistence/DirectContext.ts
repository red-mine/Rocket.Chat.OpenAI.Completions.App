import {
    IPersistence,
    IPersistenceRead,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from "@rocket.chat/apps-engine/definition/metadata";

export class DirectContext {
    // add a record
    public static async get(
        read: IRead,
        message_id: string
    ): Promise<any> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "direct_context"
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MESSAGE,
                message_id
            ),
        ];

        const records: any = await read
            .getPersistenceReader()
            .readByAssociations(associations);
        return records;
    }

    public static async update(
        persist: IPersistence,
        msg_id: string,
        context: any
    ): Promise<boolean> {
        const associations: Array<RocketChatAssociationRecord> = [
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                "direct_context"
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MESSAGE,
                msg_id
            ),
        ];

        try {
            await persist.updateByAssociations(
                associations,
                { context },
                true
            );
        } catch (err) {
            return false;
        }
        return true;
    }
}
