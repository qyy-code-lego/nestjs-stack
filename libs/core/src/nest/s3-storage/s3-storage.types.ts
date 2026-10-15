import {
  ObjectCannedACL,
  PutObjectCommandInput,
  UploadPartCommandInput,
} from '@aws-sdk/client-s3';

export interface S3StorageBaseOptions {
  ossConfigCode: string;
}

export interface S3StorageUploadOptions extends S3StorageBaseOptions {
  key: string;
  body: NonNullable<PutObjectCommandInput['Body']>;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
  acl?: ObjectCannedACL;
}

export interface S3StorageDownloadOptions extends S3StorageBaseOptions {
  key: string;
  range?: string;
}

export interface S3StorageHeadOptions extends S3StorageBaseOptions {
  key: string;
}

export interface S3StorageDeleteOptions extends S3StorageBaseOptions {
  key: string;
}

export interface S3StorageSetAclOptions extends S3StorageBaseOptions {
  key: string;
  acl: ObjectCannedACL;
}

export interface S3StorageListOptions extends S3StorageBaseOptions {
  prefix?: string;
  delimiter?: string;
  continuationToken?: string;
  maxKeys?: number;
}

export interface S3StorageSignOptions extends S3StorageBaseOptions {
  key: string;
  operation: 'getObject' | 'putObject';
  expiresIn?: number;
  contentType?: string;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export interface S3StorageSignPutOptions extends S3StorageBaseOptions {
  key: string;
  expiresIn?: number;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
  acl?: ObjectCannedACL;
  contentLength?: number;
  contentMd5?: string;
}

export interface S3StorageSignGetOptions extends S3StorageBaseOptions {
  key: string;
  expiresIn?: number;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export interface S3StorageSignUploadPartOptions extends S3StorageBaseOptions {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
  contentLength?: number;
  contentMd5?: string;
}

export interface S3StorageMultipartInitOptions extends S3StorageBaseOptions {
  key: string;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  acl?: ObjectCannedACL;
}

export interface S3StorageUploadPartOptions extends S3StorageBaseOptions {
  key: string;
  uploadId: string;
  partNumber: number;
  body: NonNullable<UploadPartCommandInput['Body']>;
  contentLength?: number;
}

export interface S3StorageMultipartPart {
  partNumber: number;
  eTag: string;
}

export interface S3StorageCompleteMultipartOptions extends S3StorageBaseOptions {
  key: string;
  uploadId: string;
  parts: S3StorageMultipartPart[];
}

export interface S3StorageAbortMultipartOptions extends S3StorageBaseOptions {
  key: string;
  uploadId: string;
}

export interface S3StorageListPartsOptions extends S3StorageBaseOptions {
  key: string;
  uploadId: string;
  partNumberMarker?: string;
  maxParts?: number;
}
