import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type SupportedLocale = 'zh-CN' | 'en-US';

const messages = {
    'zh-CN': {
        collections: '集合',
        users: '用户',
        logs: '日志',
        orderDemo: '订单演示',
        apiKeys: 'API 密钥',
        apiDemo: 'API 测试台',
        appSettings: '应用设置',
        systemSettings: '系统设置',
        applicationTitleFallback: 'PocketBase.Net',
        loginSubtitleFallback: '管理后台',
        signIn: '登录',
        createAccount: '注册账户',
        loginFailed: '登录失败，请检查账号密码或后端服务。',
        loginDefaultHint: '默认账号：admin@pocketbase.net / Admin1234',
        loginEmailPlaceholder: '邮箱地址',
        loginDisplayNamePlaceholder: '显示名称',
        loginPasswordPlaceholder: '密码',
        loginPleaseWait: '请稍候...',
        loginAlreadyHaveAccount: '已有账号？去登录',
        loginNoAccount: '没有账号？立即注册',
        userRoleAdmin: '管理员',
        userRoleUser: '普通用户',
        tooltipCollectionSettings: '集合设置',
        tooltipChangePassword: '修改密码',
        tooltipSignOut: '退出登录',
        noCollectionsYet: '还没有集合',
        noCollectionsHint: '创建一个集合开始使用。',
        newCollection: '新建集合',
        sidebarSearchCollections: '搜索集合...',
        sidebarNoCollectionsFound: '未找到集合',
        sidebarNoCollectionsYet: '暂无集合',
        usersSearchPlaceholder: '搜索用户...',
        usersNewUser: '新建用户',
        usersId: 'ID',
        usersEmail: '邮箱',
        usersDisplayName: '显示名称',
        usersRole: '角色',
        usersStatus: '状态',
        usersActions: '操作',
        usersActive: '启用',
        usersInactive: '禁用',
        usersFailedCreate: '创建用户失败',
        usersFailedUpdate: '更新用户失败',
        usersDialogNewTitle: '新建用户',
        usersDialogEditTitle: '编辑用户',
        usersPassword: '密码',
        usersCancel: '取消',
        usersCreate: '创建',
        usersCreating: '创建中...',
        usersSaveChanges: '保存更改',
        usersSaving: '保存中...',
        usersResetPasswordOptional: '重置密码（可选）',
        usersPasswordKeepHint: '留空则保持当前密码',
        logsTitle: '日志',
        logsSubtitle: '查看并管理系统所有操作的审计日志',
        logsSearchPlaceholder: '搜索日志（动作、资源类型）...',
        logsDeleteOlderThan30Days: '删除 30 天前日志',
        logsDeleteAll: '删除全部',
        logsTimestamp: '时间',
        logsAction: '动作',
        logsResource: '资源',
        logsResourceId: '资源 ID',
        logsActor: '操作者',
        logsLoading: '加载中...',
        logsNoSearchResult: '没有匹配的日志',
        logsEmpty: '暂无日志',
        logsTotal: '日志总数',
        logsDeleteAllConfirmTitle: '确认删除全部日志？',
        logsDeleteAllConfirmDesc: '将永久删除全部审计日志，且不可恢复。',
        logsDeleteSelectedConfirmDesc: '将永久删除所选审计日志，且不可恢复。',
        logsDeleteOlderThanTitle: '删除早于指定时间的日志',
        logsDeleteOlderThanDesc: '永久删除早于指定天数的日志。',
        logsDaysOld: '日志天数',
        delete: '删除',
        deleting: '删除中...',
        logsDeleteSelected: '删除所选',
        logsUnknownActor: '未知',
        applicationSettingsAuditTitle: '配置变更审计',
        applicationSettingsAuditSubtitle: '查看谁在何时修改了哪些全局配置参数。',
        applicationSettingsAuditNoRecords: '暂无配置变更记录',
        applicationSettingsAuditChangedAt: '变更时间',
        applicationSettingsAuditActor: '变更人',
        applicationSettingsAuditChanges: '变更内容',
        applicationSettingsUploadLogo: '上传本地 Logo',
        applicationSettingsUploadingLogo: '上传中...'
    },
    'en-US': {
        collections: 'Collections',
        users: 'Users',
        logs: 'Logs',
        orderDemo: 'Order Demo',
        apiKeys: 'API Keys',
        apiDemo: 'API Playground',
        appSettings: 'Application Settings',
        systemSettings: 'System Settings',
        applicationTitleFallback: 'PocketBase.Net',
        loginSubtitleFallback: 'Admin dashboard',
        signIn: 'Sign In',
        createAccount: 'Create Account',
        loginFailed: 'Login failed. Check credentials or backend.',
        loginDefaultHint: 'Default: admin@pocketbase.net / Admin1234',
        loginEmailPlaceholder: 'Email address',
        loginDisplayNamePlaceholder: 'Display name',
        loginPasswordPlaceholder: 'Password',
        loginPleaseWait: 'Please wait...',
        loginAlreadyHaveAccount: 'Already have an account? Sign in',
        loginNoAccount: "Don't have an account? Register",
        userRoleAdmin: 'Admin',
        userRoleUser: 'User',
        tooltipCollectionSettings: 'Collection settings',
        tooltipChangePassword: 'Change password',
        tooltipSignOut: 'Sign out',
        noCollectionsYet: 'No collections yet',
        noCollectionsHint: 'Create a collection to get started.',
        newCollection: 'New collection',
        sidebarSearchCollections: 'Search collections...',
        sidebarNoCollectionsFound: 'No collections found',
        sidebarNoCollectionsYet: 'No collections yet',
        usersSearchPlaceholder: 'Search users...',
        usersNewUser: 'New user',
        usersId: 'ID',
        usersEmail: 'Email',
        usersDisplayName: 'Display Name',
        usersRole: 'Role',
        usersStatus: 'Status',
        usersActions: 'Actions',
        usersActive: 'Active',
        usersInactive: 'Inactive',
        usersFailedCreate: 'Failed to create user',
        usersFailedUpdate: 'Failed to update user',
        usersDialogNewTitle: 'New user',
        usersDialogEditTitle: 'Edit user',
        usersPassword: 'Password',
        usersCancel: 'Cancel',
        usersCreate: 'Create',
        usersCreating: 'Creating...',
        usersSaveChanges: 'Save changes',
        usersSaving: 'Saving...',
        usersResetPasswordOptional: 'Reset password (optional)',
        usersPasswordKeepHint: 'Leave empty to keep current password',
        logsTitle: 'Logs',
        logsSubtitle: 'View and manage audit logs of all system activities',
        logsSearchPlaceholder: 'Search logs (action, resource type)...',
        logsDeleteOlderThan30Days: 'Delete older than 30 days',
        logsDeleteAll: 'Delete all',
        logsTimestamp: 'Timestamp',
        logsAction: 'Action',
        logsResource: 'Resource',
        logsResourceId: 'Resource ID',
        logsActor: 'Actor',
        logsLoading: 'Loading...',
        logsNoSearchResult: 'No logs match your search',
        logsEmpty: 'No logs yet',
        logsTotal: 'Total logs',
        logsDeleteAllConfirmTitle: 'Delete all logs?',
        logsDeleteAllConfirmDesc: 'This will permanently delete all audit logs. This action cannot be undone.',
        logsDeleteSelectedConfirmDesc: 'This will permanently delete the selected audit logs. This action cannot be undone.',
        logsDeleteOlderThanTitle: 'Delete logs older than',
        logsDeleteOlderThanDesc: 'Permanently delete all logs older than the selected number of days.',
        logsDaysOld: 'Days old',
        delete: 'Delete',
        deleting: 'Deleting...',
        logsDeleteSelected: 'Delete selected',
        logsUnknownActor: 'Unknown',
        applicationSettingsAuditTitle: 'Settings Change Audit',
        applicationSettingsAuditSubtitle: 'See who changed which global parameters and when.',
        applicationSettingsAuditNoRecords: 'No settings change records yet',
        applicationSettingsAuditChangedAt: 'Changed At',
        applicationSettingsAuditActor: 'Actor',
        applicationSettingsAuditChanges: 'Changes',
        applicationSettingsUploadLogo: 'Upload Local Logo',
        applicationSettingsUploadingLogo: 'Uploading...'
    }
} as const;

type MessageKey = keyof (typeof messages)['zh-CN'];

type I18nContextValue = {
    locale: SupportedLocale;
    setLocale: (locale: SupportedLocale) => void;
    t: (key: MessageKey) => string;
};

const STORAGE_KEY = 'pocketbase.net.locale';

const I18nContext = createContext<I18nContextValue | null>(null);

function normalizeLocale(raw?: string | null): SupportedLocale {
    if (!raw) return 'zh-CN';
    if (raw.toLowerCase().startsWith('en')) return 'en-US';
    return 'zh-CN';
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<SupportedLocale>(() => normalizeLocale(localStorage.getItem(STORAGE_KEY)));

    const setLocale = (next: SupportedLocale) => {
        setLocaleState(next);
        localStorage.setItem(STORAGE_KEY, next);
    };

    const value = useMemo<I18nContextValue>(() => ({
        locale,
        setLocale,
        t: (key: MessageKey) => messages[locale][key]
    }), [locale]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
    return ctx;
}

export function toSupportedLocale(raw?: string | null): SupportedLocale {
    return normalizeLocale(raw);
}
