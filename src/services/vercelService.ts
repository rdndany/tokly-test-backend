import axios from "axios";
import { Vercel } from "@vercel/sdk";
import config from "../config";
import { VercelDomainResponse } from "../types/project";
import { createLogger } from "../utils/logger";

const logger = createLogger("VercelService");

export class VercelService {
  private static readonly baseURL = config.vercel.apiUrl;
  private static readonly apiToken = config.vercel.apiToken;
  private static readonly projectId = config.vercel.projectId;
  private static readonly teamId = config.vercel.teamId;

  private static getVercelClient() {
    return new Vercel({
      bearerToken: this.apiToken,
    });
  }

  private static getHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  static isConfigured(): boolean {
    return Boolean(this.apiToken && this.projectId);
  }

  private static getParams() {
    const params: Record<string, string> = {};
    if (this.teamId) {
      params.teamId = this.teamId;
    }
    return params;
  }

  static async addDomain(domain: string): Promise<VercelDomainResponse> {
    try {
      const response = await axios.post<VercelDomainResponse>(
        `${this.baseURL}/v9/projects/${this.projectId}/domains`,
        { name: domain },
        {
          headers: this.getHeaders(),
          params: this.getParams(),
        }
      );
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      logger.error(
        "Error adding domain to Vercel:",
        (err.response as { data?: unknown })?.data ?? err.message
      );
      throw new Error(
        err.response?.data?.error?.message ?? "Failed to add domain to Vercel"
      );
    }
  }

  static async getDomain(domain: string): Promise<VercelDomainResponse> {
    try {
      const response = await axios.get<VercelDomainResponse>(
        `${this.baseURL}/v9/projects/${this.projectId}/domains/${domain}`,
        {
          headers: this.getHeaders(),
          params: this.getParams(),
        }
      );
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; message?: string };
      const errorMessage =
        (err.response as { data?: { error?: { message?: string } } })?.data?.error?.message ??
        "Failed to get domain information";
      const newError = new Error(errorMessage) as Error & { response?: unknown };
      newError.response = err.response;
      throw newError;
    }
  }

  static async verifyDomain(domain: string): Promise<VercelDomainResponse> {
    try {
      const response = await axios.post<VercelDomainResponse>(
        `${this.baseURL}/v9/projects/${this.projectId}/domains/${domain}/verify`,
        {},
        {
          headers: this.getHeaders(),
          params: this.getParams(),
        }
      );
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { code?: string; message?: string } } }; message?: string };
      if (err.response?.data?.error?.code === "missing_txt_record") {
        logger.info("Domain DNS not yet configured - user needs to set up TXT record");
      } else {
        logger.error("Error verifying domain:", err.response?.data ?? err.message);
      }
      throw new Error(
        err.response?.data?.error?.message ?? "Failed to verify domain"
      );
    }
  }

  static async checkDomainVerificationStatus(domain: string): Promise<{
    verified: boolean;
    verification: unknown[];
    configuration: unknown;
    usingVercelDNS: boolean;
    misconfigured: boolean;
  }> {
    try {
      const vercel = this.getVercelClient();
      const domainConfig = await vercel.domains.getDomainConfig({
        domain,
        teamId: this.teamId ?? undefined,
      });

      const cfg = domainConfig as {
        configuredBy?: string | null;
        misconfigured?: boolean;
        verification?: unknown[];
      };
      const configuredBy = cfg.configuredBy;
      const misconfigured = cfg.misconfigured ?? false;
      const actuallyVerified = configuredBy != null && !misconfigured;
      const usingVercelDNS =
        configuredBy != null &&
        configuredBy !== "" &&
        !misconfigured;

      logger.info(
        `Domain ${domain} DNS config status: configuredBy="${configuredBy}", misconfigured=${misconfigured}, actuallyVerified=${actuallyVerified}, usingVercelDNS=${usingVercelDNS}`
      );

      return {
        verified: actuallyVerified,
        verification: cfg.verification ?? [],
        configuration: domainConfig,
        usingVercelDNS,
        misconfigured,
      };
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number; statusCode?: number; code?: string; response?: { data?: unknown } };
      logger.error(`Error checking domain verification status for domain ${domain}:`, err);
      logger.error("Error details:", {
        message: err.message,
        status: err.status,
        statusCode: err.statusCode,
        code: err.code,
        response: err.response?.data,
      });

      if (err.message?.includes("not found") || err.status === 404) {
        logger.info(`Domain ${domain} not found in Vercel account`);
        return {
          verified: false,
          verification: [],
          configuration: null,
          usingVercelDNS: false,
          misconfigured: false,
        };
      }

      throw new Error(err.message ?? "Failed to check domain verification status");
    }
  }

  static async getDomainConfig(domain: string): Promise<{
    configuredBy: string;
    acceptedChallenges: string[];
    recommendedIPv4: Array<{ rank: number; value: string[] }>;
    recommendedCNAME: Array<{ rank: number; value: string }>;
    misconfigured: boolean;
  }> {
    try {
      const vercel = this.getVercelClient();
      const result = await vercel.domains.getDomainConfig({
        domain,
        teamId: this.teamId ?? undefined,
      });

      return {
        configuredBy: result.configuredBy ?? "",
        acceptedChallenges: result.acceptedChallenges ?? [],
        recommendedIPv4: result.recommendedIPv4 ?? [],
        recommendedCNAME: result.recommendedCNAME ?? [],
        misconfigured: result.misconfigured ?? false,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Error getting domain config with Vercel SDK:", err);
      throw new Error(err.message ?? "Failed to get domain config");
    }
  }

  static async getDomainSetupInfo(domain: string): Promise<{
    verified: boolean;
    verification: unknown[];
    configuration: unknown;
    dnsSetupOptions: {
      nameservers: {
        title: string;
        description: string;
        records: Array<{ type: string; name: string; value: string; reason: string }>;
        instructions: string[];
        note: string;
      };
      dnsRecords: {
        title: string;
        description: string;
        records: Array<{ type: string; name: string; value: string; reason: string }>;
        instructions: string[];
        note: string;
      };
    };
  }> {
    try {
      const domainStatus = await this.checkDomainVerificationStatus(domain);

      if (!domainStatus.configuration) {
        logger.info(`Domain ${domain} not found in Vercel account, returning setup instructions`);
        return this.getFallbackDomainSetupInfo(domain);
      }

      let domainConfig: Awaited<ReturnType<typeof this.getDomainConfig>> | null = null;
      try {
        domainConfig = await this.getDomainConfig(domain);
      } catch (configError) {
        logger.warn("Could not get domain config, using fallback values:", configError);
      }

      const dnsSetupOptions = this.buildDnsSetupOptions(domain, domainConfig);
      return {
        verified: domainStatus.verified,
        verification: domainStatus.verification,
        configuration: domainStatus.configuration,
        dnsSetupOptions,
      };
    } catch {
      let domainConfig: Awaited<ReturnType<typeof this.getDomainConfig>> | null = null;
      try {
        domainConfig = await this.getDomainConfig(domain);
      } catch {
        domainConfig = null;
      }
      const dnsSetupOptions = this.buildDnsSetupOptions(domain, domainConfig);
      return {
        verified: false,
        verification: [],
        configuration: null,
        dnsSetupOptions,
      };
    }
  }

  private static buildDnsSetupOptions(
    domain: string,
    domainConfig: Awaited<ReturnType<typeof this.getDomainConfig>> | null
  ): {
    nameservers: {
      title: string;
      description: string;
      records: Array<{ type: string; name: string; value: string; reason: string }>;
      instructions: string[];
      note: string;
    };
    dnsRecords: {
      title: string;
      description: string;
      records: Array<{ type: string; name: string; value: string; reason: string }>;
      instructions: string[];
      note: string;
    };
  } {
    const isApexDomain = !domain.includes(".") || domain.split(".").length === 2;

    const vercelNameservers = [
      { type: "NS", name: "@", value: "ns1.vercel-dns.com", reason: "Vercel nameserver" },
      { type: "NS", name: "@", value: "ns2.vercel-dns.com", reason: "Vercel nameserver" },
    ];

    let dnsRecords: Array<{ type: string; name: string; value: string; reason: string }>;
    if (domainConfig?.recommendedIPv4?.length) {
      const ipAddresses = domainConfig.recommendedIPv4[0].value;
      dnsRecords = isApexDomain
        ? [
            { type: "A", name: "@", value: ipAddresses[0], reason: "Vercel IP address for apex domain" },
            ...(domainConfig.recommendedCNAME?.length
              ? [{ type: "CNAME", name: "www", value: domainConfig.recommendedCNAME[0].value, reason: "WWW subdomain redirect" }]
              : []),
          ]
        : domainConfig.recommendedCNAME?.length
          ? [{ type: "CNAME", name: "@", value: domainConfig.recommendedCNAME[0].value, reason: "Subdomain CNAME record" }]
          : [];
    } else if (domainConfig?.recommendedCNAME?.length) {
      dnsRecords = [{ type: "CNAME", name: "@", value: domainConfig.recommendedCNAME[0].value, reason: "Subdomain CNAME record" }];
    } else {
      dnsRecords = isApexDomain
        ? [
            { type: "A", name: "@", value: "76.76.21.21", reason: "Vercel IP address for apex domain (fallback)" },
            { type: "CNAME", name: "www", value: "cname.vercel-dns.com", reason: "WWW subdomain redirect (fallback)" },
          ]
        : [{ type: "CNAME", name: "@", value: "cname.vercel-dns.com", reason: "Subdomain CNAME record (fallback)" }];
    }

    return {
      nameservers: {
        title: "Option 1: Change Nameservers (Recommended)",
        description: "Point your domain to Vercel's nameservers for automatic DNS management",
        records: vercelNameservers,
        instructions: [
          "Log in to your domain registrar's control panel",
          "Navigate to nameserver or DNS settings",
          "Replace your current nameservers with the Vercel nameservers shown below",
          "Save the changes and wait for DNS propagation (this can take up to 24 hours)",
          "Click 'Check DNS Configuration' button once nameservers are updated",
          "Your custom domain will be live once verification is complete",
        ],
        note: "This method allows Vercel to automatically manage all DNS records for your domain.",
      },
      dnsRecords: {
        title: "Option 2: Add DNS Records",
        description: "Keep your current nameservers and add specific DNS records to connect to Vercel",
        records: dnsRecords,
        instructions: [
          "Log in to your domain registrar's DNS management panel",
          "Navigate to DNS records or DNS management section",
          "Add the DNS records shown below (replace any existing records of the same type)",
          "Save the changes and wait for DNS propagation (this can take up to 24 hours)",
          "Click 'Check DNS Configuration' button once records are added",
          "Your custom domain will be live once verification is complete",
        ],
        note: "This method keeps your current nameservers while directing traffic to Vercel.",
      },
    };
  }

  static async removeDomain(domain: string): Promise<void> {
    try {
      await axios.delete(
        `${this.baseURL}/v9/projects/${this.projectId}/domains/${domain}`,
        {
          headers: this.getHeaders(),
          params: this.getParams(),
        }
      );
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      throw new Error(
        err.response?.data?.error?.message ?? "Failed to remove domain"
      );
    }
  }

  static async listDomains(): Promise<VercelDomainResponse[]> {
    try {
      const response = await axios.get<{ domains: VercelDomainResponse[] }>(
        `${this.baseURL}/v9/projects/${this.projectId}/domains`,
        {
          headers: this.getHeaders(),
          params: this.getParams(),
        }
      );
      return response.data.domains;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      throw new Error(
        err.response?.data?.error?.message ?? "Failed to list domains"
      );
    }
  }

  static async isDomainAvailable(domain: string): Promise<boolean> {
    try {
      await this.getDomain(domain);
      return false;
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; message?: string };
      if (
        err.response?.status === 404 ||
        err.message?.includes("not_found") ||
        err.message?.includes("Project Domain not found")
      ) {
        return true;
      }
      throw error;
    }
  }

  private static getFallbackDomainSetupInfo(domain: string): Awaited<ReturnType<typeof this.getDomainSetupInfo>> {
    const dnsSetupOptions = this.buildDnsSetupOptions(domain, null);
    return {
      verified: false,
      verification: [],
      configuration: null,
      dnsSetupOptions,
    };
  }
}
