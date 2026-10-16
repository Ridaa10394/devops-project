{{- define "stocksense.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* release "stocksense" -> "stocksense"; release "demo" -> "demo-stocksense" */}}
{{- define "stocksense.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "stocksense.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/part-of: {{ include "stocksense.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* selector labels for one component: include "stocksense.selector" (list . "backend") */}}
{{- define "stocksense.selector" -}}
{{- $ctx := index . 0 -}}
app.kubernetes.io/name: {{ include "stocksense.name" $ctx }}-{{ index . 1 }}
app.kubernetes.io/instance: {{ $ctx.Release.Name }}
{{- end -}}

{{- define "stocksense.image" -}}
{{- $root := index . 0 -}}
{{- $img := index . 1 -}}
{{- printf "%s:%s" $img.repository (default (default $root.Chart.AppVersion $root.Values.global.imageTag) $img.tag) -}}
{{- end -}}

{{- define "stocksense.secretName" -}}
{{- default (printf "%s-db" (include "stocksense.fullname" .)) .Values.auth.existingSecret -}}
{{- end -}}

{{- define "stocksense.dbHost" -}}
{{- if .Values.postgres.enabled -}}
{{- printf "%s-postgres" (include "stocksense.fullname" .) -}}
{{- else -}}
{{- required "externalDatabase.host is required when postgres.enabled=false" .Values.externalDatabase.host -}}
{{- end -}}
{{- end -}}
