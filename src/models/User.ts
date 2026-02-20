import mongoose, { Document, Schema } from "mongoose";

export interface UserDocument extends Omit<Document, "_id"> {
  _id: string;
  email?: string;
  name: string;
  image?: string;
  role: string;
  handle?: string;
  fullName?: string;
  companyRole?: string;
  companySize?: string;
  theme?: string;
  /** When true, workspace invitations are accepted automatically when listed. Default true. */
  autoAcceptInvitations?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>({
  _id: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
  },
  name: {
    type: String,
    required: true,
  },
  image: {
    type: String,
  },
  role: {
    type: String,
    default: "user",
  },
  handle: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
  },
  fullName: {
    type: String,
    trim: true,
  },
  companyRole: {
    type: String,
    trim: true,
  },
  companySize: {
    type: String,
    trim: true,
  },
  theme: {
    type: String,
    trim: true,
    enum: ["light", "dark", "system"],
  },
  autoAcceptInvitations: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
  updatedAt: {
    type: Date,
    required: true,
  },
});

const UserModel = mongoose.model<UserDocument>("User", userSchema);
export default UserModel;
