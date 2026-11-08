import { Router, type IRouter } from "express";
import healthRouter from "./health";
import foundationRouter from "./foundation";
import authRouter from "./auth";
import operationsRouter from "./operations";
import importsRouter from "./imports";
import planningCenterRouter from "./planning-center";

const router: IRouter = Router();

router.use(healthRouter);
router.use(foundationRouter);
router.use(authRouter);
router.use(importsRouter);
router.use(planningCenterRouter);
router.use(operationsRouter);

export default router;
