import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface WorkspaceInvitationEmailProps {
  inviterName?: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  expiresInDays?: number;
}

const WorkspaceInvitationEmail = ({
  inviterName = "A team member",
  workspaceName = "Workspace",
  role = "editor",
  acceptUrl = "https://tokly.io/invitations/accept",
  expiresInDays = 7,
}: WorkspaceInvitationEmailProps) => {
  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "editor"
        ? "Editor"
        : role === "viewer"
          ? "Viewer"
          : role;
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {workspaceName} on Tokly
      </Preview>
      <Tailwind>
        <Body className="bg-gray-100 font-sans py-[40px]">
          <Container className="max-w-[600px] mx-auto bg-white rounded-[8px] shadow-sm border border-gray-200">
            <Section className="bg-[#6366f1] px-[40px] py-[32px] text-center rounded-t-[8px]">
              <Heading className="text-white text-[24px] font-semibold m-0 mb-[4px]">
                You&apos;re invited!
              </Heading>
              <Text className="text-indigo-100 text-[14px] m-0">
                {inviterName} invited you to join {workspaceName}
              </Text>
            </Section>

            <Section className="px-[40px] py-[32px]">
              <Text className="text-slate-800 text-[16px] font-medium mb-[16px]">
                You&apos;ve been invited to join{" "}
                <strong className="text-slate-800">{workspaceName}</strong> as a{" "}
                <strong className="text-slate-800">{roleLabel}</strong>.
              </Text>

              <Text className="text-slate-700 text-[15px] leading-[24px] mb-[16px]">
                {role === "admin"
                  ? "As an Admin, you can create and edit projects, and manage workspace members."
                  : role === "editor"
                    ? "As an Editor, you can create and edit projects in this workspace."
                    : "As a Viewer, you can view projects in this workspace."}
              </Text>

              <Text className="text-slate-600 text-[14px] mb-[24px]">
                This invitation expires in {expiresInDays} days.
              </Text>

              <Section className="text-center mb-[24px]">
                <Button
                  href={acceptUrl}
                  className="bg-[#6366f1] text-white px-[24px] py-[12px] rounded-[6px] text-[14px] font-medium no-underline box-border"
                >
                  Accept invitation
                </Button>
              </Section>

              <Text className="text-slate-500 text-[13px]">
                If you don&apos;t have an account yet, you&apos;ll be able to
                create one when you accept.
              </Text>
            </Section>

            <Hr className="border-gray-200 mx-[40px]" />
            <Section className="px-[40px] py-[24px] text-center">
              <Text className="text-gray-500 text-[12px] mb-[8px]">
              Tokly - Build apps with AI
              </Text>
              <Text className="text-gray-400 text-[11px] m-0 mt-[8px]">
                © {new Date().getFullYear()} Tokly. All rights reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

WorkspaceInvitationEmail.PreviewProps = {
  inviterName: "Daniel",
  workspaceName: "Daniel's Tokly",
  role: "editor",
  acceptUrl: "https://tokly.io/invitations/accept?token=abc123",
  expiresInDays: 7,
} as WorkspaceInvitationEmailProps;

export default WorkspaceInvitationEmail;
