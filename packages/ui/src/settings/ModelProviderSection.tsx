import { useCallback, useEffect, useState } from "react";
import { useAIbuddyIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useModelProviders } from "@/hooks/useModelProviders.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import {
  getProviderFormLabel,
  getProviderFormApiKeyManagementUrl,
} from "@/lib/providerSettingsFormTypes.js";
import { sortModelProvidersForDisplay } from "@/lib/modelProviderOrdering.js";
import {
  addPendingSettingsSectionListener,
  consumePendingSettingsModelProviderTarget,
  type SettingsModelProviderTarget,
} from "@/lib/settingsNavigation.js";
import type { ModelProviderNavGroup } from "./model-provider-section/constants.js";
import { InlineEditableProviderCard } from "./model-provider-section/InlineEditableProviderCard.js";
import { ModelProviderSectionLayout } from "./model-provider-section/SectionLayout.js";
import { ProviderTemplatePicker } from "./model-provider-section/ProviderTemplatePicker.js";
import { createCustomProviderNodeKey } from "./model-provider-section/utils.js";
import { confirmAndDeleteModelProvider } from "./model-provider-section/modelProviderActions.js";

export {
  fuzzyMatch,
  handleEndpointSuggestionPopoverOpenAutoFocus,
  resolveEndpointSuggestionOpenRequest,
} from "./model-provider-section/utils.js";

export function ModelProviderSection({
  workspacePath = "",
  connectivityWorkspacePath,
  connectivityWorkspaceRequired = false,
  pendingModelProviderTarget,
  onConsumePendingModelProviderTarget,
}: {
  workspacePath?: string;
  connectivityWorkspacePath?: string;
  connectivityWorkspaceRequired?: boolean;
  pendingModelProviderTarget?: SettingsModelProviderTarget;
  onConsumePendingModelProviderTarget?: () => void;
}) {
  const { intl, locale } = useAIbuddyIntl();
  const platform = usePlatform();
  const confirmDialog = useConfirmDialog();
  const {
    modelProviders,
    providerTemplates,
    displayOrder,
    loading,
    loadError,
    reload,
    refreshing,
    refresh,
    saveProvider,
    createPersonalProvider,
    addPersonalModel,
    savePersonalModelDraft,
    setPersonalModelEnabled,
    deletePersonalModel,
    deleteProvider,
    reorderProviderModels,
    saveDisplayOrder,
    reorderableProviderIds,
    testModelConnectivity,
    providerSettingsView,
  } = useModelProviders({
    workspacePath,
    connectivityWorkspacePath,
    connectivityWorkspaceRequired,
    connectivityUnavailableMessage: intl.formatMessage({
      id: "settings.modelProvider.testModel.localWorkspaceUnavailable",
    }),
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => consumePendingSettingsModelProviderTarget()?.providerId ?? null,
  );
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const providers = sortModelProvidersForDisplay(modelProviders, displayOrder);
  // 新建后先保留目标 ID，等 Host 的共享快照发布后再展示，避免旧快照把导航改回首项。
  const selected =
    providers.find((provider) => provider.providerId === selectedProviderId) ?? providers[0];
  useEffect(() => {
    if (!pendingModelProviderTarget) return;
    setSelectedProviderId(pendingModelProviderTarget.providerId);
    setTemplatePickerOpen(false);
    onConsumePendingModelProviderTarget?.();
  }, [pendingModelProviderTarget, onConsumePendingModelProviderTarget]);
  useEffect(
    () =>
      addPendingSettingsSectionListener((section, detail) => {
        if (section !== "modelProvider") return;
        if (detail?.modelProviderId) setSelectedProviderId(detail.modelProviderId);
        setTemplatePickerOpen(false);
      }),
    [],
  );
  const handleCreate = useCallback(
    async (input: { templateId?: string; providerName?: string }) => {
      setCreating(true);
      try {
        const created = await createPersonalProvider({ ...input, locale });
        setSelectedProviderId(created.providerId);
        setTemplatePickerOpen(false);
      } finally {
        setCreating(false);
      }
    },
    [createPersonalProvider, locale],
  );
  const navigationGroups: ModelProviderNavGroup[] = [
    {
      id: "custom",
      title: intl.formatMessage({ id: "settings.modelProviderTitle" }),
      items: providers.map((provider) => ({
        type: "custom",
        key: createCustomProviderNodeKey(provider.providerId),
        label: getProviderFormLabel(provider),
        provider,
        statusActive: provider.executable,
      })),
    },
  ];
  if (loadError)
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-ui-base">
        <p className="text-destructive">{loadError.message}</p>
        <Button type="button" variant="outline" onClick={reload}>
          {intl.formatMessage({ id: "common.retry" })}
        </Button>
      </div>
    );
  const apiKeyUrl = selected ? getProviderFormApiKeyManagementUrl(selected) : undefined;
  return (
    <ModelProviderSectionLayout
      description={intl.formatMessage({ id: "settings.modelProviderDescription" })}
      refreshLabel={intl.formatMessage({ id: "settings.modelProvider.refresh" })}
      loadingLabel={intl.formatMessage({ id: "common.loading" })}
      presetLoading={loading || refreshing}
      customLoading={loading || refreshing}
      onRefresh={() => {
        void refresh();
      }}
      addProviderLabel={intl.formatMessage({ id: "settings.modelProvider.addProviderAction" })}
      onAddProvider={() => setTemplatePickerOpen(true)}
      navigationGroups={navigationGroups}
      selectedNodeKey={selected ? createCustomProviderNodeKey(selected.providerId) : null}
      onSelectNavItem={(item) => {
        if (item.type !== "custom") return;
        setSelectedProviderId(item.provider.providerId);
        setTemplatePickerOpen(false);
      }}
      reorderableProviderIds={reorderableProviderIds}
      onReorderProviderIds={async (ids) => {
        await saveDisplayOrder({ providerIds: ids });
      }}
    >
      {templatePickerOpen || (!loading && !selected) ? (
        <ProviderTemplatePicker
          templates={providerTemplates}
          creating={creating}
          onBack={() => setTemplatePickerOpen(false)}
          onCreateFromTemplate={(templateId) => handleCreate({ templateId })}
          onCreateCustom={(providerName) => handleCreate({ providerName })}
        />
      ) : selected ? (
        <InlineEditableProviderCard
          key={selected.providerId}
          provider={selected}
          onSave={async (provider) => {
            await saveProvider(provider);
          }}
          onAddPersonalModel={addPersonalModel}
          onSavePersonalModelDraft={savePersonalModelDraft}
          onSetPersonalModelEnabled={setPersonalModelEnabled}
          onDeletePersonalModel={deletePersonalModel}
          settingsRevision={providerSettingsView?.revision}
          onDelete={
            reorderableProviderIds?.has(selected.providerId)
              ? () =>
                  confirmAndDeleteModelProvider({
                    provider: selected,
                    confirmDialog,
                    intl,
                    deleteProvider,
                  })
              : undefined
          }
          onReorderModelIds={(ids) => reorderProviderModels(selected.providerId, ids)}
          onTestModel={testModelConnectivity}
          presetApiKeyUrl={apiKeyUrl}
          readOnlyEndpoints={false}
          nameEditable
          onOpenPresetApiKey={
            apiKeyUrl
              ? () => {
                  void platform.openExternal(apiKeyUrl);
                }
              : undefined
          }
        />
      ) : null}
    </ModelProviderSectionLayout>
  );
}
