import mongoose, { Document, Schema } from "mongoose";

export type PlanId = "free" | "pro";

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
  /** Subscription plan. Default 'free'. */
  plan?: PlanId;
  /** Pro flex credits per month (from subscription). Default 100. Used when plan is 'pro'. */
  proCreditsPerMonth?: number;
  /** Stripe customer id for Checkout (required with Accounts V2 / test mode). */
  stripeCustomerId?: string;
  /** Unique affiliate/referral code for this user. */
  affiliateCode?: string;
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
  plan: {
    type: String,
    enum: ["free", "pro"],
    default: "free",
  },
  proCreditsPerMonth: {
    type: Number,
    default: 100,
  },
  stripeCustomerId: {
    type: String,
    trim: true,
    sparse: true,
  },
  affiliateCode: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true,
    unique: true,
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
