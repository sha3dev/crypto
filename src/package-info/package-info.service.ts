/**
 * @section imports:internals
 */

import config from "../config.ts";

/**
 * @section types
 */

export type PackageInfo = { packageName: string };

type PackageInfoServiceOptions = { packageName: string };

/**
 * @section public:properties
 */

export class PackageInfoService {
  private readonly packageName: string;

  /**
   * @section constructor
   */

  public constructor(options: PackageInfoServiceOptions) {
    this.packageName = options.packageName;
  }

  /**
   * @section factory
   */

  public static createDefault(): PackageInfoService {
    const service = new PackageInfoService({ packageName: config.PACKAGE_NAME });
    return service;
  }

  /**
   * @section public:methods
   */

  public readPackageInfo(): PackageInfo {
    const packageInfo: PackageInfo = { packageName: this.packageName };
    return packageInfo;
  }
}
