import { KubernetesManager } from "../types.js";
import * as k8s from "@kubernetes/client-node";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  ContainerTemplate,
  containerTemplates,
} from "../config/container-templates.js";

export const createPodSchema = {
  name: "create_pod",
  description: "Create a new Kubernetes pod",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      namespace: { type: "string" },
      template: {
        type: "string",
        enum: ContainerTemplate.options,
      },
      command: {
        type: "array",
        items: { type: "string" },
        optional: true,
      },
    },
    required: ["name", "namespace", "template"],
  },
} as const;

export async function createPod(
  k8sManager: KubernetesManager,
  input: {
    name: string;
    namespace: string;
    template: string;
    command?: string[];
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

  // Create container config, optionally override command
  let containerConfig: k8s.V1Container = {
    ...templateConfig,
    ...(input.command && {
      command: input.command,
      args: undefined, // Clear default args when command is overridden
    }),
  };

  const pod: k8s.V1Pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: input.name,
      namespace: input.namespace,
      labels: {
        "mcp-managed": "true",
        app: input.name,
      },
    },
    spec: {
      containers: [containerConfig],
    },
  };

  const response = await k8sManager
    .getCoreApi()
    .createNamespacedPod(input.namespace, pod)
    .catch((error: any) => {
      console.error("Pod creation error:", {
        status: error.response?.statusCode,
        message: error.response?.body?.message || error.message,
        details: error.response?.body,
      });
      throw error;
    });

  k8sManager.trackResource("Pod", input.name, input.namespace);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            podName: response.body.metadata!.name!,
            status: "created",
          },
          null,
          2
        ),
      },
    ],
  };
}
