import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
let enabled = false;
if (endpoint) {
  const exporter = new OTLPTraceExporter({ url: endpoint.replace(/\/$/, '') + '/v1/traces' });
  const provider = new TracerProvider({ spanProcessors: [new BatchSpanProcessor({ exporter })] });
  trace.setGlobalTracerProvider(provider);
  enabled = true;
}

export const tracer = trace.getTracer('agentproof-evaluator', '0.2.0');
export const telemetryStatus = { enabled, exporter: enabled ? 'otlp-http' : 'none' };
