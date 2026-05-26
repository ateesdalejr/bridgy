declare module "pngjs" {
  export class PNG {
    static sync: {
      write(png: PNG): Buffer;
    };

    width: number;
    height: number;
    data: Buffer;

    constructor(options: { width: number; height: number; colorType?: number });
  }
}
