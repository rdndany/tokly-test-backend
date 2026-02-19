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

interface ProjectCreateEmailProps {
  name: string;
  projectName: string;
  creationDate: string;
  projectUrl?: string;
}

const ProjectCreateEmail = ({
  name = "User",
  projectName = "My Project",
  creationDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  projectUrl = "https://tokly.io",
}: ProjectCreateEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Your project {projectName} has been created successfully</Preview>
      <Tailwind>
        <Body className="bg-gray-100 font-sans py-[40px]">
          <Container className="max-w-[600px] mx-auto bg-white rounded-[8px] shadow-sm border border-gray-200">
            {/* Header Section */}
            <Section className="bg-[#6366f1] px-[40px] py-[32px] text-center rounded-t-[8px]">
              <Heading className="text-white text-[24px] font-semibold m-0 mb-[4px]">
                Project Created Successfully
              </Heading>
              <Text className="text-indigo-100 text-[14px] m-0">
                {projectName} is ready to edit
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-[40px] py-[32px]">
              <Text className="text-slate-800 text-[16px] font-medium mb-[16px]">
                Hello {name},
              </Text>

              <Text className="text-slate-700 text-[15px] leading-[24px] mb-[24px]">
                Congratulations! Your project{" "}
                <strong className="text-slate-800">{projectName}</strong> has
                been successfully created on {creationDate}.
              </Text>

              <Text className="text-slate-700 text-[15px] leading-[24px] mb-[24px]">
                Your project is ready to edit. Open it to continue building with
                AI, customize the design, and deploy when you&apos;re ready.
              </Text>

              {/* CTA Button */}
              <Section className="text-center mb-[24px]">
                <Button
                  href={projectUrl}
                  className="bg-[#6366f1] text-white px-[24px] py-[12px] rounded-[6px] text-[14px] font-medium no-underline box-border"
                >
                  Open Project
                </Button>
              </Section>

              {/* Next Steps Tips */}
              <Section className="bg-indigo-50 rounded-[6px] p-[20px] border border-indigo-200 mb-[24px]">
                <Text className="text-indigo-800 text-[14px] font-medium mb-[12px] m-0">
                  💡 What you can do next:
                </Text>
                <Text className="text-indigo-700 text-[13px] m-0 mb-[8px]">
                  • Edit and refine your app with AI assistance
                </Text>
                <Text className="text-indigo-700 text-[13px] m-0 mb-[8px]">
                  • Customize the design, colors, and layout
                </Text>
                <Text className="text-indigo-700 text-[13px] m-0">
                  • Deploy your project when it&apos;s ready
                </Text>
              </Section>

              <Text className="text-slate-700 text-[15px] leading-[24px] mb-[24px]">
                If you have any questions or need help, our support team is here
                for you.
              </Text>
            </Section>

            {/* Footer */}
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

ProjectCreateEmail.PreviewProps = {
  name: "Alex",
  projectName: "My Awesome App",
  creationDate: "February 13, 2025",
  projectUrl: "https://tokly.io",
} as ProjectCreateEmailProps;

export default ProjectCreateEmail;
