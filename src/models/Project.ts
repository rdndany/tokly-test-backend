import mongoose, { Document, Schema } from "mongoose";
import type {
  InstallationSteps,
  ListingPlatformEntry,
  SocialLinkItem,
  TokenDetails,
  TokenFeatures,
} from "../types/tokenDetails";

const listingPlatformEntrySchema = new Schema<ListingPlatformEntry>(
  {
    providerId: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

export interface ProjectDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  workspaceId?: mongoose.Types.ObjectId;
  folderId?: mongoose.Types.ObjectId;
  prompt: string;
  title?: string;
  description?: string;
  heroText?: string;
  socialLinks?: SocialLinkItem[];
  category?: string;
  auditProvider?: string;
  auditLink?: string;
  kycProvider?: string;
  kycLink?: string;
  listingPlatforms?: ListingPlatformEntry[];
  installationSteps?: InstallationSteps;
  tokenDetails?: TokenDetails;
  templateId?: string;
  /** Font family ID for template typography (e.g. poppins, rubik) */
  fontFamily?: string;
  /** Color schema ID for template theming (e.g. default, sunset) */
  colorSchemaId?: string;
  /** Section visibility: { hero: true, about: true } – which sections to show on the landing page */
  sectionVisibility?: Record<string, boolean>;
  /** Section order: { hero: 1, about: 2 } – display order on the landing page */
  sectionOrder?: Record<string, number>;
  /** Section layout customization: { hero: { layout: { type: "compact" } } } – layout type per section */
  sectionCustomization?: Record<
    string,
    { layout?: { type?: string } }
  >;
  /** When true, hide the "Edit with Tokly" badge (Pro Plan feature, works for now) */
  hideToklyBadge?: boolean;
  /** When true, stop collecting analytics (view counts) for this project */
  analyticsDisabled?: boolean;
  /** Project visibility: public (discoverable) or workspace (hidden, prevent copying). Default: workspace */
  projectVisibility?: "public" | "workspace";
  /** SEO: favicon URL (website icon) */
  favicon?: string;
  /** SEO: meta title (max 60 chars) */
  seoTitle?: string;
  /** SEO: meta description (max 160 chars) */
  seoDescription?: string;
  /** SEO: Open Graph image URL */
  ogImage?: string;
  /** Screenshot thumbnail of published page (captured on publish, stored in S3) */
  thumbnailUrl?: string;
  /** Publish URL: subdomain (e.g. "pepe") for slug.domain format */
  subdomain?: string;
  /** Publish URL: domain (e.g. "tokly.io") */
  domain?: string;
  /** True when the project has been published (has subdomain+domain and user completed publish flow) */
  published?: boolean;
  /** Custom domain (e.g. "example.com") - Pro feature. User adds CNAME pointing to subdomain.domain */
  customDomain?: string;
  /** Total token supply (e.g. 1000000000). Used for tokenomics section. */
  totalSupply?: string;
  /** Token allocation breakdown for tokenomics section */
  allocations?: TokenAllocationDocument[];
  /** Roadmap phases with milestones for roadmap section */
  phases?: RoadmapPhaseDocument[];
  /** FAQ items for FAQ section */
  faqItems?: FAQItemDocument[];
  /** Team members for team section */
  teamMembers?: TeamMemberDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const socialLinkItemSchema = new Schema<SocialLinkItem>(
  {
    platform: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const installationStepsSchema = new Schema<InstallationSteps>(
  {
    tokenDetailsStepCompleted: { type: Boolean },
    logoStepCompleted: { type: Boolean },
    descriptionStepCompleted: { type: Boolean },
    socialLinksStepCompleted: { type: Boolean },
    templateStepCompleted: { type: Boolean },
    auditKycStepCompleted: { type: Boolean },
  },
  { _id: false }
);

const tokenFeaturesSchema = new Schema<TokenFeatures>(
  {
    liquidityLocked: { type: Boolean },
    teamVesting: { type: Boolean },
    teamVestingDuration: { type: String, trim: true },
    transactionTaxRates: { type: Boolean },
    sellTax: { type: Number },
    buyTax: { type: Number },
    transferTax: { type: Number },
    contractRenounced: { type: Boolean },
    burnMechanism: { type: Boolean },
    stakingRewards: { type: Boolean },
    mintAuthorityRevoked: { type: Boolean },
    freezeAuthorityRevoked: { type: Boolean },
    updateAuthorityRevoked: { type: Boolean },
  },
  { _id: false }
);

export interface TokenAllocationDocument {
  id: string;
  name: string;
  percentage: number;
  color: string;
}

const tokenAllocationSchema = new Schema<TokenAllocationDocument>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    color: { type: String, required: true, trim: true },
  },
  { _id: false }
);

export interface RoadmapMilestoneDocument {
  id: string;
  text: string;
  completed: boolean;
}

export interface RoadmapPhaseDocument {
  id: string;
  name: string;
  milestones: RoadmapMilestoneDocument[];
}

const roadmapMilestoneSchema = new Schema<RoadmapMilestoneDocument>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const roadmapPhaseSchema = new Schema<RoadmapPhaseDocument>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    milestones: { type: [roadmapMilestoneSchema], default: [] },
  },
  { _id: false }
);

export interface FAQItemDocument {
  id: string;
  question: string;
  answer: string;
}

const faqItemSchema = new Schema<FAQItemDocument>(
  {
    id: { type: String, required: true },
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false }
);

export interface TeamMemberSocialDocument {
  type: string;
  url: string;
}

export interface TeamMemberDocument {
  id: string;
  image?: string;
  name: string;
  role: string;
  socials: TeamMemberSocialDocument[];
}

const teamMemberSocialSchema = new Schema<TeamMemberSocialDocument>(
  {
    type: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const teamMemberSchema = new Schema<TeamMemberDocument>(
  {
    id: { type: String, required: true },
    image: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    socials: { type: [teamMemberSocialSchema], default: [] },
  },
  { _id: false }
);

const tokenDetailsSchema = new Schema<TokenDetails>(
  {
    address: { type: String, trim: true },
    chain: { type: String, trim: true },
    dexUrl: { type: String, trim: true },
    name: { type: String, trim: true },
    symbol: { type: String, trim: true },
    logo: { type: String, trim: true },
    launchType: { type: String, trim: true },
    launchPlatformUrl: { type: String, trim: true },
    tokenFeatures: { type: tokenFeaturesSchema },
    decimals: { type: Number },
    price: { type: Number },
    market_cap: { type: Number },
    market_cap_diluted: { type: Number },
    volume: { type: Number },
    volume_change_24h: { type: Number },
    volume_7d: { type: Number },
    liquidity: { type: Number },
    price_change_24h: { type: Number },
    total_supply: { type: Number },
    circulating_supply: { type: Number },
  },
  { _id: false }
);

const projectSchema = new Schema<ProjectDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      index: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectFolder",
      index: true,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    heroText: {
      type: String,
      trim: true,
    },
    socialLinks: {
      type: [socialLinkItemSchema],
      default: undefined,
    },
    auditProvider: { type: String, trim: true },
    auditLink: { type: String, trim: true },
    kycProvider: { type: String, trim: true },
    kycLink: { type: String, trim: true },
    listingPlatforms: {
      type: [listingPlatformEntrySchema],
      default: undefined,
    },
    installationSteps: {
      type: installationStepsSchema,
      default: undefined,
    },
    templateId: { type: String, trim: true },
    fontFamily: { type: String, trim: true },
    colorSchemaId: { type: String, trim: true },
    sectionVisibility: { type: Schema.Types.Mixed },
    sectionOrder: { type: Schema.Types.Mixed },
    sectionCustomization: { type: Schema.Types.Mixed },
    hideToklyBadge: { type: Boolean },
    analyticsDisabled: { type: Boolean },
    projectVisibility: { type: String, enum: ["public", "workspace"], default: "workspace" },
    favicon: { type: String, trim: true },
    seoTitle: { type: String, trim: true },
    seoDescription: { type: String, trim: true },
    ogImage: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },
    tokenDetails: {
      type: tokenDetailsSchema,
      default: undefined,
    },
    subdomain: { type: String, trim: true },
    domain: { type: String, trim: true },
    published: { type: Boolean },
    customDomain: { type: String, trim: true, sparse: true },
    totalSupply: { type: String, trim: true },
    allocations: {
      type: [tokenAllocationSchema],
      default: undefined,
    },
    phases: {
      type: [roadmapPhaseSchema],
      default: undefined,
    },
    faqItems: {
      type: [faqItemSchema],
      default: undefined,
    },
    teamMembers: {
      type: [teamMemberSchema],
      default: undefined,
    },
  },
  { timestamps: true }
);

// Unique subdomain+domain: no two projects can share the same publish URL
projectSchema.index({ subdomain: 1, domain: 1 }, { unique: true, sparse: true });
// Unique custom domain
projectSchema.index({ customDomain: 1 }, { unique: true, sparse: true });

const ProjectModel = mongoose.model<ProjectDocument>("Project", projectSchema);
export default ProjectModel;
