import { Disposable, EventEmitter, workspace, type Event, type ExtensionContext, type Uri } from 'vscode';
import { debug } from '../decorators/log';
import type {
	DeprecatedGlobalStorage,
	DeprecatedWorkspaceStorage,
	GlobalStorage,
	SecretKeys,
	WorkspaceStorage
} from '../../constants.storage';
import { extensionPrefix } from '../../constants';

type GlobalStorageKeys = keyof (GlobalStorage & DeprecatedGlobalStorage);
type WorkspaceStorageKeys = keyof (WorkspaceStorage & DeprecatedWorkspaceStorage);

// Keys that can be moved to file storage when they get too large
const LARGE_DATA_KEYS: (keyof GlobalStorage)[] = [
	'avatars',
	'repoVisibility',
];

// Maximum size in bytes before we consider moving data to file storage
const MAX_MEMORY_STORAGE_SIZE = 500 * 1024; // 500KB

export interface LargeDataStorageManager {
	/**
	 * Gets data from either memory or file storage
	 */
	get<T extends keyof GlobalStorage>(key: T): Promise<GlobalStorage[T] | undefined>;

	/**
	 * Stores data, automatically choosing between memory and file storage
	 */
	store<T extends keyof GlobalStorage>(key: T, value: GlobalStorage[T] | undefined): Promise<void>;

	/**
	 * Deletes data from both memory and file storage
	 */
	delete<T extends keyof GlobalStorage>(key: T): Promise<void>;

	/**
	 * Migrates existing large data from memory to file storage
	 */
	migrateExistingData(): Promise<void>;
}

export class FileBasedLargeDataStorageManager implements LargeDataStorageManager, Disposable {
	private readonly _disposable: Disposable;
	private readonly _fileStorageUri: Uri;

	constructor(private readonly context: ExtensionContext) {
		this._fileStorageUri = context.globalStorageUri;
		this._disposable = Disposable.from();

		// Ensure storage directory exists
		void this.ensureStorageDirectory();
	}

	dispose(): void {
		this._disposable.dispose();
	}

	private async ensureStorageDirectory(): Promise<void> {
		try {
			await workspace.fs.stat(this._fileStorageUri);
		} catch {
			await workspace.fs.createDirectory(this._fileStorageUri);
		}
	}

	private getFileUri(key: string): Uri {
		return Uri.joinPath(this._fileStorageUri, `${extensionPrefix}-${key}.json`);
	}

	private isLargeDataKey(key: string): key is keyof GlobalStorage {
		return LARGE_DATA_KEYS.includes(key as keyof GlobalStorage);
	}

	private async getDataSize(data: any): Promise<number> {
		if (data == null) return 0;
		return Buffer.byteLength(JSON.stringify(data), 'utf8');
	}

	private async shouldUseFileStorage(key: string, data: any): Promise<boolean> {
		if (!this.isLargeDataKey(key)) {
			return false;
		}

		const size = await this.getDataSize(data);
		return size > MAX_MEMORY_STORAGE_SIZE;
	}

	@debug({ logThreshold: 50 })
	async get<T extends keyof GlobalStorage>(key: T): Promise<GlobalStorage[T] | undefined> {
		// First check if data is in file storage
		if (this.isLargeDataKey(key)) {
			const fileUri = this.getFileUri(key);
			try {
				const fileData = await workspace.fs.readFile(fileUri);
				const data = JSON.parse(fileData.toString());
				return data;
			} catch {
				// File doesn't exist or is corrupted, fall back to memory storage
			}
		}

		// Fall back to memory storage
		return this.context.globalState.get(`${extensionPrefix}:${key}`);
	}

	@debug({ args: { 1: false }, logThreshold: 250 })
	async store<T extends keyof GlobalStorage>(key: T, value: GlobalStorage[T] | undefined): Promise<void> {
		if (value === undefined) {
			return this.delete(key);
		}

		const useFileStorage = await this.shouldUseFileStorage(key, value);

		if (useFileStorage) {
			// Store in file
			const fileUri = this.getFileUri(key);
			const data = JSON.stringify(value);
			await workspace.fs.writeFile(fileUri, Buffer.from(data, 'utf8'));

			// Remove from memory storage if it exists there
			await this.context.globalState.update(`${extensionPrefix}:${key}`, undefined);
		} else {
			// Store in memory
			await this.context.globalState.update(`${extensionPrefix}:${key}`, value);

			// Remove from file storage if it exists there
			if (this.isLargeDataKey(key)) {
				const fileUri = this.getFileUri(key);
				try {
					await workspace.fs.delete(fileUri);
				} catch {
					// File doesn't exist, which is fine
				}
			}
		}
	}

	@debug({ logThreshold: 250 })
	async delete<T extends keyof GlobalStorage>(key: T): Promise<void> {
		// Remove from memory storage
		await this.context.globalState.update(`${extensionPrefix}:${key}`, undefined);

		// Remove from file storage if applicable
		if (this.isLargeDataKey(key)) {
			const fileUri = this.getFileUri(key);
			try {
				await workspace.fs.delete(fileUri);
			} catch {
				// File doesn't exist, which is fine
			}
		}
	}

	@debug({ logThreshold: 250 })
	async migrateExistingData(): Promise<void> {
		for (const key of LARGE_DATA_KEYS) {
			const data = this.context.globalState.get(`${extensionPrefix}:${key}`);
			if (data != null) {
				const shouldMigrate = await this.shouldUseFileStorage(key, data);
				if (shouldMigrate) {
					// Store in file storage
					const fileUri = this.getFileUri(key);
					const serializedData = JSON.stringify(data);
					await workspace.fs.writeFile(fileUri, Buffer.from(serializedData, 'utf8'));

					// Remove from memory storage
					await this.context.globalState.update(`${extensionPrefix}:${key}`, undefined);
				}
			}
		}
	}
}
