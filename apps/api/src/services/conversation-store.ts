import { createHash, randomUUID } from "node:crypto";
import { type Collection, MongoClient } from "mongodb";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

export type Conversation = {
  id: string;
  ownerHash: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
};

export type ConversationSummary = Pick<Conversation, "id" | "title" | "createdAt" | "updatedAt">;

export interface ConversationStore {
  connect?(): Promise<void>;
  close?(): Promise<void>;
  create(ownerHash: string): Promise<Conversation>;
  list(ownerHash: string): Promise<ConversationSummary[]>;
  get(ownerHash: string, id: string): Promise<Conversation | null>;
  append(ownerHash: string, id: string, message: ConversationMessage): Promise<boolean>;
  delete(ownerHash: string, id: string): Promise<boolean>;
}

export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class MongoConversationStore implements ConversationStore {
  private readonly client: MongoClient;
  private collection!: Collection<Conversation>;

  constructor(uri: string, databaseName: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    this.databaseName = databaseName;
  }

  private readonly databaseName: string;

  async connect() {
    await this.client.connect();
    this.collection = this.client.db(this.databaseName).collection<Conversation>("conversations");
    await Promise.all([
      this.collection.createIndex({ id: 1 }, { unique: true }),
      this.collection.createIndex({ ownerHash: 1, updatedAt: -1 }),
    ]);
  }

  async close() {
    await this.client.close();
  }

  async create(ownerHash: string) {
    const now = new Date();
    const conversation: Conversation = {
      id: randomUUID(),
      ownerHash,
      title: "New chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.collection.insertOne(conversation);
    return conversation;
  }

  async list(ownerHash: string) {
    return this.collection
      .find({ ownerHash }, { projection: { _id: 0, id: 1, title: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
  }

  get(ownerHash: string, id: string) {
    return this.collection.findOne({ ownerHash, id }, { projection: { _id: 0 } });
  }

  async append(ownerHash: string, id: string, message: ConversationMessage) {
    const result = await this.collection.updateOne(
      { ownerHash, id },
      {
        $push: { messages: { $each: [message], $slice: -100 } },
        $set: {
          updatedAt: message.createdAt,
          ...(message.role === "user" ? { title: message.content.slice(0, 72) } : {}),
        },
      },
    );
    return result.matchedCount === 1;
  }

  async delete(ownerHash: string, id: string) {
    const result = await this.collection.deleteOne({ ownerHash, id });
    return result.deletedCount === 1;
  }
}
