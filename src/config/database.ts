import mongoose from "mongoose";
import config from "./index";
import { createLogger } from "../utils/logger";

const logger = createLogger("Database");

const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(config.database.mongoURI);
    logger.info("Database connected");
  } catch (error) {
    logger.error("Error connecting to DB:", error);
    process.exit(1);
  }
};

export default connectDatabase;
