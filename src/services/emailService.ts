import { render } from "@react-email/render";
import { Resend } from "resend";
import ProjectCreateEmail from "../email-templates/projectCreateEmail";
import WorkspaceInvitationEmail from "../email-templates/workspaceInvitationEmail";
import config from "../config";
import { createLogger } from "../utils/logger";

const logger = createLogger("EmailService");

let resendInstance: Resend | null = null;

export const initializeResend = (apiKey?: string): Resend | null => {
  const key = apiKey || config.resend.apiKey;
  if (!key) {
    logger.warn("Resend API key not configured, email sending disabled");
    return null;
  }
  if (!resendInstance) {
    resendInstance = new Resend(key);
  }
  return resendInstance;
};

export const getResend = (): Resend | null => {
  if (!resendInstance) {
    resendInstance = initializeResend();
  }
  return resendInstance;
};

export const sendProjectCreateMail = async (
  to: string,
  name: string,
  projectName: string,
  creationDate: string,
  projectUrl?: string
): Promise<{ success: boolean; error?: unknown }> => {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: "Resend not initialized" };
    }

    const html = await render(
      ProjectCreateEmail({
        name,
        projectName,
        creationDate,
        projectUrl,
      })
    );

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to,
      subject: `Your project ${projectName} has been created successfully`,
      html,
    });

    if (error) {
      logger.error("Failed to send project create email:", error);
      return { success: false, error };
    }

    logger.info("Project create email sent", { to, projectName, id: data?.id });
    return { success: true };
  } catch (err) {
    logger.error("Error sending project create email:", err);
    return { success: false, error: err };
  }
};

export const sendWorkspaceInvitationMail = async (
  to: string,
  params: {
    inviterName: string;
    workspaceName: string;
    role: string;
    acceptUrl: string;
    expiresInDays?: number;
  }
): Promise<{ success: boolean; error?: unknown }> => {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: "Resend not initialized" };
    }

    const html = await render(
      WorkspaceInvitationEmail({
        inviterName: params.inviterName,
        workspaceName: params.workspaceName,
        role: params.role,
        acceptUrl: params.acceptUrl,
        expiresInDays: params.expiresInDays ?? 7,
      })
    );

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to,
      subject: `You're invited to join ${params.workspaceName} on Tokly`,
      html,
    });

    if (error) {
      logger.error("Failed to send workspace invitation email:", error);
      return { success: false, error };
    }

    logger.info("Workspace invitation email sent", {
      to,
      workspaceName: params.workspaceName,
      id: data?.id,
    });
    return { success: true };
  } catch (err) {
    logger.error("Error sending workspace invitation email:", err);
    return { success: false, error: err };
  }
};
