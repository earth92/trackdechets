import { MongoBulkWriteError, MongoClient } from "mongodb";
import { Event } from "@prisma/client";
import { EventCollection } from "./types";
import { WriteErrors } from "./writeErrors";
import logger from "../logging/logger";

const { MONGO_URL } = process.env;

const EVENTS_COLLECTION = "events";

const mongodbClient = new MongoClient(MONGO_URL);

const database = mongodbClient.db();
const eventsCollection =
  database.collection<EventCollection>(EVENTS_COLLECTION);

export async function closeMongoClient() {
  if (!mongodbClient) return Promise.resolve();

  return mongodbClient.close();
}

export async function getStreamEvents(streamId: string, lte?: Date) {
  const documents = await eventsCollection
    .find({ streamId, ...(lte && { createdAt: { $lte: lte } }) })
    .toArray();

  return documents;
}

export async function insertStreamEvents(tdEvents: Event[]) {
  try {
    await eventsCollection.bulkWrite(
      tdEvents.map(fullEvent => {
        const { id, ...evt } = fullEvent;
        return {
          insertOne: {
            document: { _id: id, ...evt }
          }
        };
      }),
      // During an ordered bulk write, if an error occurs during the processing of an operation,
      // MongoDB returns without processing the remaining operations in the list.
      // In contrast, when ordered is false, MongoDB continues to process remaining write operations in the list.
      { ordered: false }
    );
  } catch (error) {
    if (!(error instanceof MongoBulkWriteError)) {
      logger.error("Unknown error during insertion in Mongo", error);
      throw error;
    }

    const DUPLICATE_KEY_ERROR_CODE = 11000;
    // We ignore duplicate key errors - if the event is already in Mongo it's fine
    // Eg: Error during bulkWrite, BulkWriteError: E11000 duplicate key error collection: ...
    if (error.code !== DUPLICATE_KEY_ERROR_CODE) {
      logger.error(
        `Unexpected error(s) occured during insertion in Mongo`,
        error.result
      );
      throw new WriteErrors(error.writeErrors);
    }
  }
}

// Creating indexes in MongoDB is an idempotent operation.
// The index is created only if it doesn't already exist.
async function createIndexes() {
  try {
    await eventsCollection.createIndex({ streamId: 1, createdAt: 1 });
  } catch (err) {
    logger.error("Error while creating indexes", err);
  }
}

createIndexes();
