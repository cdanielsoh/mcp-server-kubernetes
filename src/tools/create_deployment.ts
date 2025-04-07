import { KubernetesManager } from "../types.js";
import * as k8s from "@kubernetes/client-node";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  ContainerTemplate,
  containerTemplates,
} from "../config/container-templates.js";

export const createDeploymentSchema = {
  name: "create_deployment",
  description: "Create a new Kubernetes deployment",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      namespace: { type: "string" },
      template: {
        type: "string",
        enum: ContainerTemplate.options,
      },
      replicas: { type: "number", default: 1 },
    },
    required: ["name", "namespace", "template"],
  },
} as const;

export async function createDeployment(
  k8sManager: KubernetesManager,
  input: {
    name: string;
    namespace: string;
    template: string;
    replicas?: number;
  }
) {
  // Get the container template configuration - removed custom template handling
  const templateConfig = containerTemplates[input.template];
  if (!templateConfig) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid template: ${input.template}`
    );
  }

  // Create a deployment with the selected template
  const deployment: k8s.V1Deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: input.name,
      namespace: input.namespace,
      labels: {
        "mcp-managed": "true",
        app: input.name,
      },
    },
    spec: {
      replicas: input.replicas || 1,
      selector: {
        matchLabels: {
          app: input.name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: input.name,
          },
        },
        spec: {
          containers: [{ ...templateConfig }],
        },
      },
    },
  };

  const response = await k8sManager
    .getAppsApi()
    .createNamespacedDeployment(input.namespace, deployment)
    .catch((error: any) => {
      console.error("Deployment creation error:", {
        status: error.response?.statusCode,
        message: error.response?.body?.message || error.message,
        details: error.response?.body,
      });
      throw error;
    });

  k8sManager.trackResource("Deployment", input.name, input.namespace);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            deploymentName: response.body.metadata!.name!,
            status: "created",
          },
          null,
          2
        ),
      },
    ],
  };
}
