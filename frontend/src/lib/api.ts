import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const api = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
});

export function setAccessToken(token: string | null) {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common.Authorization;
    }
}

// Auth types
export type LoginResponse = {
    accessToken: string;
    userId: string;
    email: string;
    displayName: string;
    roles: string[];
};

export type ChangePasswordRequest = {
    oldPassword: string;
    newPassword: string;
};

// Collection types
export type CollectionItem = {
    id: string;
    name: string;
    slug: string;
    description: string;
    schemaJson: string;
    listRule: number;
    viewRule: number;
    createRule: number;
    updateRule: number;
    deleteRule: number;
    ownerField?: string;
    createdAt: string;
    updatedAt: string;
};

export type PublishPlanItem = {
    type: string;
    target: string;
    action: string;
    summary: string;
    sql?: string;
};

export type PublishCollectionPreviewResponse = {
    collectionId: string;
    collectionSlug: string;
    tableName: string;
    status: string;
    sqlScript: string;
    schemaHash: string;
    requestedAt: string;
    message?: string;
    planItems: PublishPlanItem[];
};

export type PublishCollectionEnqueueResponse = {
    taskId: string;
    collectionId: string;
    collectionSlug: string;
    hangfireJobId?: string;
    status: string;
    createdAt: string;
};

export type CollectionPublishStatus = {
    collectionId: string;
    tableName?: string;
    isPublished: boolean;
    schemaHash?: string;
    lastPublishedAt?: string;
    latestVersion?: number;
    latestStatus?: string;
};

export type PublishTaskStatus = {
    taskId: string;
    collectionId: string;
    collectionSlug: string;
    hangfireJobId?: string;
    status: string;
    progress: number;
    message?: string;
    schemaHash?: string;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    planItems: PublishPlanItem[];
    sqlScript?: string;
};

// Field types
export const FieldType = {
    Text: 1,
    Email: 2,
    Url: 3,
    Number: 4,
    Checkbox: 5,
    Date: 6,
    DateTime: 7,
    Select: 8,
    Relation: 9,
    User: 10,
    File: 11,
    Textarea: 12,
    Json: 13,
    AutoIncrement: 14,
    Avatar: 15,
    Formula: 16,
    Lookup: 17,
} as const;
export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export const FieldTypeNames: Record<FieldType, string> = {
    [FieldType.Text]: 'Text',
    [FieldType.Email]: 'Email',
    [FieldType.Url]: 'URL',
    [FieldType.Number]: 'Number',
    [FieldType.Checkbox]: 'Checkbox',
    [FieldType.Date]: 'Date',
    [FieldType.DateTime]: 'DateTime',
    [FieldType.Select]: 'Select',
    [FieldType.Relation]: 'Relation',
    [FieldType.User]: 'User',
    [FieldType.File]: 'File',
    [FieldType.Textarea]: 'Textarea',
    [FieldType.Json]: 'JSON',
    [FieldType.AutoIncrement]: 'Auto Increment',
    [FieldType.Avatar]: 'Avatar',
    [FieldType.Formula]: 'Formula',
    [FieldType.Lookup]: 'Lookup',
};

export type Field = {
    id: string;
    collectionDefinitionId: string;
    name: string;
    label: string;
    type: FieldType;
    isRequired: boolean;
    isUnique: boolean;
    defaultValue?: string;
    config: Record<string, any>;
    validationRules?: string;
    displayOrder: number;
    isSystem: boolean;
    description?: string;
    createdAt: string;
    updatedAt: string;
};

export type FieldResponse = Field;

export type FieldCreateRequest = {
    name: string;
    label: string;
    type: FieldType;
    isRequired?: boolean;
    isUnique?: boolean;
    defaultValue?: string;
    config?: string;
    validationRules?: string;
    displayOrder?: number;
    description?: string;
};

export type FieldUpdateRequest = {
    name: string;
    label: string;
    type: FieldType;
    isRequired: boolean;
    isUnique: boolean;
    defaultValue?: string;
    config?: string;
    validationRules?: string;
    displayOrder?: number;
    description?: string;
};

export type FieldTypeDefinition = {
    type: FieldType;
    name: string;
    description: string;
    supportsOptions: boolean;
    supportsRelation: boolean;
    supportsValidation: boolean;
    allowedConfigs: string[];
};

// Record types
export type RecordResponse = {
    id: string;
    collectionId: string;
    collectionSlug: string;
    data: Record<string, any>;
    ownerId?: string;
    createdAt: string;
    updatedAt: string;
};

// File attachment types
export type FileAttachmentResponse = {
    id: string;
    recordId: string;
    collectionSlug: string;
    fieldName: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    url: string;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
};

export type PagedRecordResponse<T = any> = {
    page: number;
    perPage: number;
    totalItems: number;
    totalPages: number;
    items: T[];
};
